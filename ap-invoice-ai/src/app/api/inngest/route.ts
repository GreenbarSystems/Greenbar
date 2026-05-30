// Inngest serve endpoint — hosts all background job functions (QUE-1).
import { serve } from "inngest/next";
import { inngest } from "@/lib/queue/inngest";
import { functions } from "@/jobs";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
