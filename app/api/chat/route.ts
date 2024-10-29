import { customModel } from "@/lib/ai";
import { convertToCoreMessages, streamText } from "ai";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { messages, selectedFilePathnames } = await request.json();

    const result = await streamText({
      model: customModel,
      system:
        "Olet ystävällinen avustaja! Pidä vastauksesi ytimekkäinä ja avuliaana.",
      messages: convertToCoreMessages(messages),
      experimental_providerMetadata: {
        files: {
          selection: selectedFilePathnames,
        },
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Error in chat:", error);
    return Response.json({ error: "Chat failed" }, { status: 500 });
  }
}
