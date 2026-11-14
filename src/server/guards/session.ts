import { auth } from "@/server/auth";
import { AppError } from "@/server/http/errors";

export type SessionContext = {
  userId: string;
  name: string;
  phoneNumber: string;
};

export async function requireSession(req: Request): Promise<SessionContext> {
  const result = await auth.api.getSession({ headers: req.headers });

  if (!result?.user) throw new AppError("UNAUTHENTICATED");

  return {
    userId: result.user.id,
    name: result.user.name,
    phoneNumber: result.user.phoneNumber ?? "",
  };
}
