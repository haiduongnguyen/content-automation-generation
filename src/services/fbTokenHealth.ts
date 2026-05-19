export type TokenHealth = {
  isValid: boolean;
  expiresAt: number | null;
  expiresAtIso: string | null;
  secondsLeft: number | null;
  daysLeft: number | null;
};

export function computeTokenHealth(isValid: boolean, expiresAtUnix: number | null, nowMs = Date.now()): TokenHealth {
  if (!isValid) {
    return {
      isValid: false,
      expiresAt: expiresAtUnix,
      expiresAtIso: expiresAtUnix ? new Date(expiresAtUnix * 1000).toISOString() : null,
      secondsLeft: null,
      daysLeft: null,
    };
  }

  if (!expiresAtUnix || expiresAtUnix <= 0) {
    return {
      isValid: true,
      expiresAt: null,
      expiresAtIso: null,
      secondsLeft: null,
      daysLeft: null,
    };
  }

  const secondsLeft = Math.floor(expiresAtUnix - nowMs / 1000);
  const daysLeft = Math.floor(secondsLeft / 86400);
  return {
    isValid: true,
    expiresAt: expiresAtUnix,
    expiresAtIso: new Date(expiresAtUnix * 1000).toISOString(),
    secondsLeft,
    daysLeft,
  };
}

