import { autoCancelExpiredGuestPasses } from '../modules/passes/passes.service';

function getMsUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // ближайшее 00:00
  return next.getTime() - now.getTime();
}

async function runJob(label: string) {
  try {
    const count = await autoCancelExpiredGuestPasses();
    console.log(`[cron] ${label}: autoCancelExpiredGuestPasses cancelled=${count}`);
  } catch (err) {
    console.error('[cron] autoCancelExpiredGuestPasses error:', err);
  }
}

/**
 * Запуск:
 * - один раз при старте (для теста)
 * - потом каждый день в 00:00 по системному TZ
 */
export function startGuestPassCron() {
  // тестовый запуск при старте
  runJob('startup');

  const firstDelay = getMsUntilNextMidnight();
  setTimeout(() => {
    runJob('midnight');
    setInterval(() => runJob('midnight'), 24 * 60 * 60 * 1000);
  }, firstDelay);
}
