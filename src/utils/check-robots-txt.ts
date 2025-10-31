import { RobotsChecker, RobotsTxtError } from '../core/robots-checker.js';

export { RobotsTxtError };

const checker = new RobotsChecker();

export async function checkRobotsTxt(
  targetUrl: string,
  userAgent: string,
): Promise<void> {
  return checker.check(targetUrl, userAgent);
}
