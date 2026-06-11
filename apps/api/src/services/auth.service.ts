import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/password";
import { hashToken, signToken } from "../lib/jwt";
import type { RegisterInput, LoginInput } from "@nebula/shared";
import { billingService } from "./billing/billing.service";
import { PLAN_LIMITS } from "./billing/billing-plans";
import { userActivityService } from "./stability/user-activity.service";
import { emailService } from "./email.service";

const SESSION_DAYS = 7;

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw new AuthError("EMAIL_EXISTS", "Email already registered", 409);
    }

    const passwordHash = await hashPassword(input.password);

    const initialCredits = PLAN_LIMITS.free.monthlyCredits ?? 100;
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        subscription: {
          create: {
            plan: "free",
            buildsLimit: PLAN_LIMITS.free.dailyAiRequests ?? 20,
            creditsBalance: initialCredits,
            renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    await prisma.creditLedger.create({
      data: {
        userId: user.id,
        type: "monthly_grant",
        amount: initialCredits,
        balanceAfter: initialCredits,
        metadata: { reason: "signup" },
      },
    });

    const session = await this.createSession(user.id);
    void emailService.sendWelcome(user.email, user.name).catch(() => undefined);
    return session;
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { subscription: true },
    });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (user.subscription?.status === "cancelled") {
      throw new AuthError("ACCOUNT_SUSPENDED", "Account suspended", 403);
    }

    const session = await this.createSession(user.id);
    await userActivityService.recordLogin(user.id);
    return session;
  }

  async logout(sessionId: string) {
    await prisma.userSession.deleteMany({ where: { id: sessionId } });
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });
    if (!user) {
      throw new AuthError("NOT_FOUND", "User not found", 404);
    }

    const billing = await billingService.getSnapshot(userId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      subscription: user.subscription
        ? {
            plan: billing.plan,
            buildsUsed: billing.usage.aiRequestsToday,
            buildsLimit: billing.limits.dailyAiRequests ?? 999999,
            creditsRemaining: billing.creditsRemaining,
            status: billing.status,
          }
        : null,
      billing,
    };
  }

  async validateSession(sessionId: string) {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { include: { subscription: true } },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.userSession.delete({ where: { id: sessionId } });
      }
      return null;
    }

    if (session.user.subscription?.status === "cancelled") {
      await prisma.userSession.delete({ where: { id: sessionId } });
      return null;
    }

    return session.user;
  }

  async createSessionForUser(userId: string) {
    return this.createSession(userId);
  }

  private async createSession(userId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

    const session = await prisma.userSession.create({
      data: {
        userId,
        tokenHash: "pending",
        expiresAt,
      },
    });

    const token = signToken({ userId, sessionId: session.id });
    await prisma.userSession.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(token) },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const authService = new AuthService();
