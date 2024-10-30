"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { useChat } from "ai/react";
import { useState } from "react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      if (file.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/process-pdf", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Failed to process document");
        }

        const result = await response.json();
        console.log("Processed document:", result);
        toast({
          title: "Document processed",
          description: `Successfully processed ${file.name}`,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "Failed to process document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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
                {message.role === "assistant" ? "Assistant" : "You"}:
              </p>
              <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </ScrollArea>
      </Card>

      <div className="flex gap-2 mb-4">
        <Input
          type="file"
          onChange={handleFileUpload}
          accept=".pdf"
          className="flex-1"
          disabled={isProcessing}
        />
        {isProcessing && (
          <div className="text-sm text-muted-foreground">
            Processing file...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || isProcessing}>
          {isLoading ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
