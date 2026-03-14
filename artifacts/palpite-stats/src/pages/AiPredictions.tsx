import { useAiPredict } from "@workspace/api-client-react";
import { useState, useRef, useEffect } from "react";
import { Cpu, Send, Sparkles, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  confidence?: number | null;
  dataPoints?: string[];
  isError?: boolean;
}

const PRE_POPULATED_QUESTIONS = [
  "What is the probability of Mbappe scoring today?",
  "Is the Real Madrid match likely to go over 2.5 goals?",
  "Which team has the best defensive average this week?",
  "Give me an accumulator tip for today's matches."
];

export default function AiPredictions() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'ai',
      content: "Hello! I'm your PalpiteStats AI assistant. Ask me about match predictions, player statistics, or betting probabilities based on our data models."
    }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const aiPredictMutation = useAiPredict();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (question: string) => {
    if (!question.trim() || aiPredictMutation.isPending) return;

    // Add User Message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    // Trigger AI Mutation
    aiPredictMutation.mutate({ data: { question } }, {
      onSuccess: (data) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-ai',
          role: 'ai',
          content: data.answer,
          confidence: data.confidence,
          dataPoints: data.dataPoints
        }]);
      },
      onError: () => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-err',
          role: 'ai',
          content: "Sorry, I encountered an error connecting to the prediction model. Please try again.",
          isError: true
        }]);
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 h-[calc(100vh-80px)] max-h-[900px] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Cpu className="text-primary w-8 h-8" /> AI Assistant
          </h1>
          <p className="text-muted-foreground mt-1">Data-driven football predictions at your fingertips.</p>
        </div>
      </div>

      <div className="flex-1 bg-card border border-white/5 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        
        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 z-10 scroll-smooth">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex gap-4 max-w-[85%]",
                  msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border shadow-lg",
                  msg.role === 'user' 
                    ? "bg-secondary border-white/10" 
                    : "bg-gradient-to-br from-primary to-emerald-700 border-primary/50"
                )}>
                  {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
                </div>

                <div className={cn(
                  "rounded-2xl p-5 text-sm md:text-base shadow-lg",
                  msg.role === 'user' 
                    ? "bg-secondary border border-white/5 text-white" 
                    : msg.isError
                      ? "bg-red-500/10 border border-red-500/30 text-red-200"
                      : "bg-card border border-white/10 text-foreground"
                )}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  
                  {msg.confidence != null && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Model Confidence:</span>
                      <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/10 rounded-md border border-primary/20">
                        {Math.round(msg.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {msg.dataPoints && msg.dataPoints.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <span className="text-xs text-muted-foreground font-medium block">Key Data Points:</span>
                      <ul className="space-y-1.5">
                        {msg.dataPoints.map((point, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground bg-background/50 px-3 py-1.5 rounded-lg border border-white/5 flex items-start gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            
            {aiPredictMutation.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4 max-w-[85%] mr-auto"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-primary/50 bg-gradient-to-br from-primary to-emerald-700 shadow-lg">
                  <Sparkles className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="bg-card border border-white/10 rounded-2xl p-5 shadow-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-background/50 border-t border-white/5 backdrop-blur-md relative z-10">
          
          {/* Example Questions */}
          {messages.length === 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {PRE_POPULATED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSubmit(q)}
                  className="text-xs text-muted-foreground bg-card hover:bg-secondary border border-white/5 hover:border-white/20 hover:text-white px-3 py-1.5 rounded-full transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="flex gap-3 relative"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about matches, odds, or player probabilities..."
              className="flex-1 bg-card border-2 border-white/10 focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl px-6 py-4 text-white placeholder:text-muted-foreground transition-all outline-none"
              disabled={aiPredictMutation.isPending}
            />
            <button
              type="submit"
              disabled={!input.trim() || aiPredictMutation.isPending}
              className="w-14 h-14 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-primary/20 shrink-0"
            >
              <Send className="w-5 h-5 ml-1" />
            </button>
          </form>
          {aiPredictMutation.isError && (
             <div className="text-red-400 text-xs mt-2 flex items-center gap-1">
               <AlertCircle className="w-3 h-3"/> Failed to process request
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
