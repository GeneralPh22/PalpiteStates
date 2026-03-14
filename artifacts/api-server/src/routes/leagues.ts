import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leaguesTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/leagues", async (_req, res) => {
  try {
    const leagues = await db.select().from(leaguesTable).orderBy(leaguesTable.name);
    const result = leagues.map((l) => ({
      id: l.id,
      name: l.name,
      country: l.country,
      logoUrl: l.logoUrl,
    }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
