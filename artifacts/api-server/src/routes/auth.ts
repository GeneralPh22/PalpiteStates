import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, subscriptionsTable, sessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "palpitestats-secret-change-in-production";
const SESSION_DAYS = 30;
const TRIAL_DAYS = 5;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function trialEndDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

function sessionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

async function getUserFromSession(req: any) {
  const authHeader = req.headers["authorization"];
  const cookieToken = req.cookies?.["ps_session"];
  const token = authHeader?.replace("Bearer ", "") || cookieToken;
  if (!token) return null;

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  if (sessions.length === 0) return null;
  const session = sessions[0];

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);

  return users.length > 0 ? { user: users[0], session } : null;
}

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid email address" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = generateToken();
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [user] = await db
      .insert(usersTable)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        emailVerifyToken: verifyToken,
        emailVerifyTokenExpiry: verifyExpiry,
      })
      .returning();

    await db.insert(subscriptionsTable).values({
      userId: user.id,
      plan: "trial",
      status: "active",
      trialStartAt: new Date(),
      trialEndAt: trialEndDate(),
    });

    const sessionToken = generateToken();
    await db.insert(sessionsTable).values({
      userId: user.id,
      token: sessionToken,
      expiresAt: sessionExpiry(),
    });

    res.cookie("ps_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });

    console.log(`[auth] Email verify token for ${email}: ${verifyToken}`);

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
      token: sessionToken,
      message: "Account created! Please check your email to verify your account.",
    });
  } catch (err: any) {
    console.error("[auth/register]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (users.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const sessionToken = generateToken();
    await db.insert(sessionsTable).values({
      userId: user.id,
      token: sessionToken,
      expiresAt: sessionExpiry(),
    });

    res.cookie("ps_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });

    const subs = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
      token: sessionToken,
      subscription: subs[0] || null,
    });
  } catch (err: any) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const cookieToken = req.cookies?.["ps_session"];
    const authHeader = req.headers["authorization"];
    const token = authHeader?.replace("Bearer ", "") || cookieToken;

    if (token) {
      await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    }

    res.clearCookie("ps_session");
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[auth/logout]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const result = await getUserFromSession(req);

    if (!result) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { user } = result;

    const subs = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);

    const sub = subs[0] || null;

    let accessLevel: "full" | "limited" | "trial" = "limited";
    if (sub) {
      if (sub.plan === "trial" && sub.status === "active") {
        const now = new Date();
        const trialEnd = sub.trialEndAt ? new Date(sub.trialEndAt) : null;
        if (trialEnd && now < trialEnd) {
          accessLevel = "trial";
        } else {
          accessLevel = "limited";
        }
      } else if (
        (sub.plan === "monthly" || sub.plan === "quarterly" || sub.plan === "semiannual" || sub.plan === "annual") &&
        sub.status === "active"
      ) {
        const now = new Date();
        const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        if (!periodEnd || now < periodEnd) {
          accessLevel = "full";
        }
      }
    }

    res.json({
      user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
      subscription: sub,
      accessLevel,
    });
  } catch (err: any) {
    console.error("[auth/me]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.emailVerifyToken, token),
          gt(usersTable.emailVerifyTokenExpiry as any, new Date())
        )
      )
      .limit(1);

    if (users.length === 0) {
      res.status(400).json({ error: "Invalid or expired verification token" });
      return;
    }

    await db
      .update(usersTable)
      .set({ emailVerified: true, emailVerifyToken: null, emailVerifyTokenExpiry: null })
      .where(eq(usersTable.id, users[0].id));

    res.json({ ok: true, message: "Email verified successfully!" });
  } catch (err: any) {
    console.error("[auth/verify-email]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/stripe/checkout", async (req, res) => {
  try {
    const result = await getUserFromSession(req);
    if (!result) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { plan } = req.body;
    const validPlans = ["monthly", "quarterly", "semiannual", "annual"];
    if (!validPlans.includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      res.status(503).json({ error: "Payment system not configured. Please contact support." });
      return;
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    const priceMap: Record<string, number> = {
      monthly: 2000,
      quarterly: 5000,
      semiannual: 9500,
      annual: 18000,
    };

    const labelMap: Record<string, string> = {
      monthly: "PalpiteStats Mensal",
      quarterly: "PalpiteStats Trimestral",
      semiannual: "PalpiteStats Semestral",
      annual: "PalpiteStats Anual",
    };

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: result.user.email,
      line_items: [
        {
          price_data: {
            currency: "brl",
            unit_amount: priceMap[plan],
            product_data: { name: labelMap[plan] },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/subscription/success?plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: { userId: String(result.user.id), plan },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[auth/stripe/checkout]", err);
    res.status(500).json({ error: err.message || "Payment error" });
  }
});

router.post("/auth/stripe/webhook", async (req, res) => {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeKey) {
      res.status(503).json({ error: "Payment system not configured" });
      return;
    }

    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);

    let event: any;
    if (webhookSecret) {
      const sig = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = req.body;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = parseInt(session.metadata?.userId);
      const plan = session.metadata?.plan;

      if (userId && plan) {
        const daysMap: Record<string, number> = {
          monthly: 30,
          quarterly: 90,
          semiannual: 180,
          annual: 365,
        };

        const days = daysMap[plan] || 30;
        const now = new Date();
        const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        const existing = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.userId, userId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(subscriptionsTable)
            .set({
              plan,
              status: "active",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              stripeCustomerId: session.customer || null,
              updatedAt: now,
            })
            .where(eq(subscriptionsTable.userId, userId));
        } else {
          await db.insert(subscriptionsTable).values({
            userId,
            plan,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            stripeCustomerId: session.customer || null,
          });
        }
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("[auth/stripe/webhook]", err);
    res.status(400).json({ error: err.message });
  }
});

export { getUserFromSession };
export default router;
