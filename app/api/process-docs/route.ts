import { processDocumentsWithContext } from "@/lib/ai/contextual-retrieval";

export async function POST(req: Request) {
  try {
    const { documents, options } = await req.json();

    if (!Array.isArray(documents)) {
      return Response.json(
        { error: "Documents must be an array" },
        { status: 400 },
      );
    }

    const result = await processDocumentsWithContext(documents, options);
    return Response.json({ success: true, documents: result.documents });
  } catch (error) {
    console.error("Error processing documents:", error);
    return Response.json(
      { error: "Failed to process documents" },
      { status: 500 },
    );
  }
}
