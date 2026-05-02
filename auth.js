const { verifyToken } = require('@clerk/backend');

/**
 * Express middleware that extracts a Clerk userId from the Authorization header
 * and attaches it to req.userId. When the header is missing, invalid, or no
 * CLERK_SECRET_KEY is configured, req.userId is null (guest mode).
 *
 * Never rejects the request — auth is optional so guest sessions still work.
 */
async function clerkAuth(req, res, next) {
  req.userId = null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = await verifyToken(token, { secretKey });
    req.userId = payload.sub || null;
  } catch (err) {
    // Invalid/expired token — treat as guest
    req.userId = null;
  }

  next();
}

module.exports = { clerkAuth };
