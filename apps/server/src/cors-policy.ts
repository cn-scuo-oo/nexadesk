const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isAllowedLocalOrigin(origin: string | null | undefined): boolean {
  if (!origin || origin === "null") {
    return true;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return loopbackHosts.has(url.hostname);
  } catch {
    return false;
  }
}

export function createLocalOnlyCorsOptions() {
  return {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      callback(null, isAllowedLocalOrigin(origin) ? true : false);
    }
  };
}
