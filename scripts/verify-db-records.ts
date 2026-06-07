/**
 * Prints row counts for Phase 1 tables (verification evidence).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, sessions, projects, messages, files] = await Promise.all([
    prisma.user.count(),
    prisma.userSession.count(),
    prisma.project.count(),
    prisma.message.count(),
    prisma.file.count(),
  ]);

  console.log("Database record counts:");
  console.log(`  users:         ${users}`);
  console.log(`  user_sessions: ${sessions}`);
  console.log(`  projects:      ${projects}`);
  console.log(`  messages:      ${messages}`);
  console.log(`  files:         ${files}`);

  const latest = await prisma.user.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      projects: { include: { messages: true, files: true }, take: 1 },
      sessions: { take: 1 },
    },
  });

  if (latest) {
    console.log("\nLatest user snapshot:");
    console.log(`  email:    ${latest.email}`);
    console.log(`  sessions: ${latest.sessions.length}`);
    const proj = latest.projects[0];
    if (proj) {
      console.log(`  project:  ${proj.name} (${proj.slug})`);
      console.log(`  messages: ${proj.messages.length}`);
      console.log(`  files:    ${proj.files.length}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
