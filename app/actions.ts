"use server";

import pdf from "pdf-parse";

export async function processPdfFile(file: File) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdf(buffer);
    return {
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        info: data.info,
      },
    };
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw new Error("Failed to process PDF file");
  }
}
