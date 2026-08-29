import { hasServerCredentials } from "@/lib/account";

export async function GET() {
  return Response.json({ hasServerCredentials: hasServerCredentials() });
}
