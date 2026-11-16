import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
@Injectable()
export class AiGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const secret = process.env.AI_WORKSPACE_TOKEN;
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException(
        "Configure AI_WORKSPACE_TOKEN with at least 32 characters"
      );
    const supplied = ctx.switchToHttp().getRequest().headers.authorization;
    const expected = Buffer.from(`Bearer ${secret}`),
      actual = Buffer.from(typeof supplied === "string" ? supplied : "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    return true;
  }
}
