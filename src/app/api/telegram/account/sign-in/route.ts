import { NextRequest } from "next/server";
import { AccountError, signInWithCode } from "@/lib/account";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await signInWithCode(body);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountError) {
      return Response.json(
        { error: error.message, needPassword: error.extra?.needPassword },
        { status: error.status },
      );
    }
    return Response.json({ error: "登录失败。" }, { status: 500 });
  }
}
