import { processPdfFile } from "@/app/actions";
import { processDocumentsWithContext } from "@/lib/ai/contextual-retrieval";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { text, metadata } = await processPdfFile(file);

    // Process document with RAG
    await processDocumentsWithContext([text], {
      chunkSize: 1000,
      chunkOverlap: 200,
      metadata: {
        fileName: file.name,
        pageCount: metadata.pageCount,
        type: "pdf",
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Error processing PDF:", error);
    return NextResponse.json(
      {
        error: "Failed to process PDF file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
