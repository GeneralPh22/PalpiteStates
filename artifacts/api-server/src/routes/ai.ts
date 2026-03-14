import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { matchesTable, playersTable, teamsTable, playerStatsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.post("/ai/predict", async (req, res) => {
  try {
    const { question, context } = req.body as {
      question: string;
      context?: { matchId?: number | null; playerId?: number | null };
    };

    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    let contextData = "";

    if (context?.matchId) {
      const matchRows = await db
        .select({ match: matchesTable, home: teamsTable, away: teamsTable })
        .from(matchesTable)
        .where(eq(matchesTable.id, context.matchId))
        .limit(1);

      if (matchRows.length > 0) {
        const m = matchRows[0].match;
        contextData += `Match context: ID=${m.id}, Status=${m.status}, `;
        contextData += `Home Win Prob=${m.homeWinProbability ?? "N/A"}, Draw Prob=${m.drawProbability ?? "N/A"}, Away Win Prob=${m.awayWinProbability ?? "N/A"}, `;
        contextData += `Over 2.5 Prob=${m.over25Probability ?? "N/A"}, BTTS Prob=${m.bttsProbability ?? "N/A"}, Expected Goals=${m.expectedGoals ?? "N/A"}. `;
        contextData += `Home Form: ${m.homeRecentForm ?? "N/A"}, Away Form: ${m.awayRecentForm ?? "N/A"}. `;
      }
    }

    if (context?.playerId) {
      const playerRows = await db
        .select({ player: playersTable, team: teamsTable })
        .from(playersTable)
        .innerJoin(teamsTable, eq(playersTable.teamId, teamsTable.id))
        .where(eq(playersTable.id, context.playerId))
        .limit(1);

      if (playerRows.length > 0) {
        const p = playerRows[0].player;
        const t = playerRows[0].team;
        contextData += `Player context: ${p.name}, Position=${p.position ?? "N/A"}, Team=${t.name}, Age=${p.age ?? "N/A"}. `;

        const statsRows = await db
          .select({ stat: playerStatsTable, match: matchesTable })
          .from(playerStatsTable)
          .innerJoin(matchesTable, eq(playerStatsTable.matchId, matchesTable.id))
          .where(eq(playerStatsTable.playerId, context.playerId))
          .orderBy(desc(matchesTable.kickoffTime))
          .limit(10);

        if (statsRows.length > 0) {
          const totals = statsRows.reduce(
            (acc, r) => ({
              goals: acc.goals + r.stat.goals,
              assists: acc.assists + r.stat.assists,
              shots: acc.shots + r.stat.shotsOnTarget,
              minutes: acc.minutes + (r.stat.minutesPlayed ?? 90),
            }),
            { goals: 0, assists: 0, shots: 0, minutes: 0 }
          );
          const per90 = totals.minutes > 0 ? 90 / totals.minutes : 0;
          contextData += `Last ${statsRows.length} matches: Goals=${totals.goals} (${(totals.goals * per90).toFixed(2)}/90), `;
          contextData += `Assists=${totals.assists} (${(totals.assists * per90).toFixed(2)}/90), `;
          contextData += `Shots on target=${totals.shots} (${(totals.shots * per90).toFixed(2)}/90). `;
        }
      }
    }

    const systemPrompt = `You are PalpiteStats AI, an expert football analytics assistant specializing in betting analysis and match predictions.
You analyze football statistics to provide data-driven insights.
Always be concise but precise. Include specific probabilities and statistical backing.
Focus on: recent form, per-90 statistics, historical averages, team performance, head-to-head records.
Format your response as a clear analysis with key points.`;

    const userMessage = contextData
      ? `${question}\n\nRelevant data:\n${contextData}`
      : question;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? "Unable to generate prediction.";

    const dataPoints: string[] = [];
    if (contextData) {
      const parts = contextData.split(". ").filter(Boolean);
      dataPoints.push(...parts.slice(0, 5));
    }

    res.json({
      answer,
      confidence: null,
      dataPoints,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
