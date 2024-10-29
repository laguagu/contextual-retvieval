"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "ai/react";
import { useState } from "react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat();
  const [file, setFile] = useState<File | null>(null);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFile(file);
    const text = await file.text();

    try {
      const response = await fetch("/api/process-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [text],
          options: {
            chunkSize: 1000,
            chunkOverlap: 200,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to process document");

      const result = await response.json();
      console.log("Document processed:", result);
    } catch (error) {
      console.error("Error processing document:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <Card className="flex-1 mb-4">
        <ScrollArea className="h-[calc(100vh-180px)] p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-4 ${
                message.role === "assistant" ? "bg-muted p-4 rounded-lg" : ""
              }`}
            >
              <p className="font-semibold">
                {message.role === "assistant" ? "Assistentti" : "Sinä"}:
              </p>
              <p className="mt-1">{message.content}</p>
            </div>
          ))}
        </ScrollArea>
      </Card>

      <div className="flex gap-2 mb-4">
        <Input
          type="file"
          onChange={handleFileUpload}
          accept=".txt,.md,.pdf"
          className="flex-1"
        />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Kysy mitä vain..."
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Lähetetään..." : "Lähetä"}
        </Button>
      </form>
    </div>
  );
}
