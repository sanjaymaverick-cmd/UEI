import { randomUUID } from "node:crypto";
import { atomic, db, type Tx } from "@uei/database";
import { getConfig } from "@uei/config";
import { DomainError, newToken, tokenHash, secureEqual } from "./core";

export interface OtpProvider {
  codeForDevelopment(): string;
}
export class DevelopmentOtpProvider implements OtpProvider {
  codeForDevelopment() {
    return getConfig().DEV_OTP;
  }
}
export class AuthService {
  constructor(
    private readonly provider: OtpProvider = new DevelopmentOtpProvider(),
  ) {}
  private hash(value: string) {
    return tokenHash(value, getConfig().AUTH_SECRET);
  }
  async requestOtp(phone: string) {
    await atomic(async (tx) => {
      const existing = await tx.otpChallenge.findUnique({ where: { phone } });
      if (existing && existing.requestedAt.getTime() > Date.now() - 60000)
        throw new DomainError(
          "AUTH_RATE_LIMITED",
          "Please wait before requesting another code.",
          429,
          true,
        );
      const data = {
        codeHash: this.hash(`${phone}:${this.provider.codeForDevelopment()}`),
        expiresAt: new Date(Date.now() + 300000),
        requestedAt: new Date(),
        attempts: 0,
        consumed: false,
      };
      await tx.otpChallenge.upsert({
        where: { phone },
        create: { phone, ...data },
        update: data,
      });
    });
    return { sent: true, provider: "development", expiresInSeconds: 300 };
  }
  private async issue(tx: Tx, userId: string, familyId: string = randomUUID()) {
    const accessToken = newToken();
    const refreshToken = newToken();
    await tx.userSession.create({
      data: {
        userId,
        familyId,
        accessHash: this.hash(accessToken),
        refreshHash: this.hash(refreshToken),
        accessUntil: new Date(Date.now() + 900000),
        refreshUntil: new Date(Date.now() + 30 * 86400000),
      },
    });
    return { accessToken, refreshToken, expiresInSeconds: 900 };
  }
  async verifyOtp(phone: string, otp: string) {
    const result = await atomic(async (tx) => {
      const challenge = await tx.otpChallenge.findUnique({ where: { phone } });
      if (
        !challenge ||
        challenge.consumed ||
        challenge.attempts >= 5 ||
        challenge.expiresAt.getTime() <= Date.now()
      )
        return null;
      await tx.otpChallenge.update({
        where: { phone },
        data: { attempts: { increment: 1 } },
      });
      if (!secureEqual(challenge.codeHash, this.hash(`${phone}:${otp}`)))
        return null;
      await tx.otpChallenge.update({
        where: { phone },
        data: { consumed: true },
      });
      const user = await tx.user.upsert({
        where: { phone },
        update: {},
        create: {
          phone,
          role: phone === getConfig().ADMIN_PHONE ? "ADMIN" : "CONSUMER",
        },
      });
      return {
        ...(await this.issue(tx, user.id)),
        user: { id: user.id, phone: user.phone, role: user.role },
      };
    });
    if (!result)
      throw new DomainError(
        "AUTH_OTP_INVALID",
        "Code is invalid or expired. Request a new code.",
        401,
      );
    return result;
  }
  async refresh(refreshToken: string) {
    const result = await atomic(async (tx) => {
      const session = await tx.userSession.findUnique({
        where: { refreshHash: this.hash(refreshToken) },
        include: { user: true },
      });
      if (!session) return null;
      if (session.rotatedAt || session.revokedAt) {
        await tx.userSession.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (session.refreshUntil.getTime() <= Date.now()) return null;
      await tx.userSession.update({
        where: { id: session.id },
        data: { rotatedAt: new Date() },
      });
      return {
        ...(await this.issue(tx, session.userId, session.familyId)),
        user: {
          id: session.user.id,
          phone: session.user.phone,
          role: session.user.role,
        },
      };
    });
    if (!result)
      throw new DomainError(
        "AUTH_SESSION_INVALID",
        "Please sign in again.",
        401,
      );
    return result;
  }
  async authenticate(accessToken: string) {
    const session = await db.userSession.findUnique({
      where: { accessHash: this.hash(accessToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.rotatedAt ||
      session.revokedAt ||
      session.accessUntil.getTime() <= Date.now()
    )
      throw new DomainError(
        "AUTH_SESSION_INVALID",
        "Please sign in again.",
        401,
      );
    return session.user;
  }
  async logout(refreshToken: string) {
    const session = await db.userSession.findUnique({
      where: { refreshHash: this.hash(refreshToken) },
    });
    if (session)
      await db.userSession.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
    return { loggedOut: true };
  }
}
