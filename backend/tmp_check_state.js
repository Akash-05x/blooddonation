const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function checkState() {
  let output = '--- DIAGNOSTIC LOG ---\n';
  try {
    const requests = await prisma.emergencyRequest.findMany({
      orderBy: { created_at: 'desc' },
      take: 10,
      include: { assignments: true }
    });
    output += 'LATEST REQUESTS:\n';
    requests.forEach(r => {
      const age = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 1000);
      output += `ID:${r.id.substring(0,8)} STATUS:${r.status} AGE:${age}s\n`;
      r.assignments.forEach(a => {
        output += `  - ASSIGN:${a.id.substring(0,4)} ROLE:${a.role} STATUS:${a.status}\n`;
      });
    });

    const tokens = await prisma.notificationToken.findMany({
      orderBy: { created_at: 'desc' },
      take: 10
    });
    output += '\nLATEST TOKENS:\n';
    tokens.forEach(t => {
      output += `TOKEN:${t.token.substring(0,8)} STATUS:${t.status} REQ:${t.request_id.substring(0,8)}\n`;
    });

  } catch (err) {
    output += `ERROR: ${err.message}\n`;
  } finally {
    fs.writeFileSync('diag_output.txt', output);
    await prisma.$disconnect();
  }
}

checkState();
