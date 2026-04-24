import { cors } from 'hono/cors';

export function localCors() {
  return cors({
    origin: (origin) => {
      if (!origin) {
        return origin;
      }
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return origin;
      }
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin;
      }
      return undefined;
    },
  });
}
