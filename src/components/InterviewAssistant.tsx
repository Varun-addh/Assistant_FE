import { useState } from "react";
import { SearchBar } from "./SearchBar";
import { AnswerCard } from "./AnswerCard";
import { ThemeToggle } from "./ThemeToggle";

export const InterviewAssistant = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const handleGenerateAnswer = async () => {
    if (!question.trim()) return;
    
    setIsGenerating(true);
    
    // Simulate AI response generation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate a mock professional interview answer
    const mockAnswer = generateMockAnswer(question);
    setAnswer(mockAnswer);
    setShowAnswer(true);
    setIsGenerating(false);
  };

  const generateMockAnswer = (q: string): string => {
    // Simple mock response generation based on common interview questions
    const lowerQ = q.toLowerCase();
    
    if (lowerQ.includes("tell me about yourself") || lowerQ.includes("introduce yourself")) {
      return "I'm a passionate software developer with over 3 years of experience in full-stack development. I've worked extensively with React, Node.js, and modern web technologies. What excites me most is solving complex problems and creating user-friendly applications. In my previous role, I led a team that improved application performance by 40% and delivered key features that increased user engagement significantly.";
    }
    
    if (lowerQ.includes("weakness") || lowerQ.includes("weaknesses")) {
      return "I'd say my biggest area for growth is public speaking. While I'm comfortable in small team settings, I used to feel nervous presenting to large groups. I've been actively working on this by volunteering to give more presentations and joining a local Toastmasters group. I've already seen improvement - last month I successfully presented our project roadmap to a 50-person audience.";
    }
    
    if (lowerQ.includes("strength") || lowerQ.includes("strengths")) {
      return "One of my key strengths is my ability to break down complex problems into manageable pieces. I approach challenges systematically, which helps me find efficient solutions quickly. For example, when our team faced a critical performance issue last quarter, I methodically analyzed the bottlenecks, identified the root cause, and implemented a solution that improved response times by 60%.";
    }
    
    if (lowerQ.includes("why") && (lowerQ.includes("company") || lowerQ.includes("job") || lowerQ.includes("role"))) {
      return "I'm excited about this opportunity because it aligns perfectly with my career goals and values. Your company's commitment to innovation and user-centric design really resonates with me. I've been following your recent product launches, and I'm impressed by how you balance technical excellence with real user needs. I believe my background in scalable web applications and my passion for creating meaningful user experiences would allow me to contribute significantly to your team's success.";
    }
    
    // Default response for other questions
    return "That's a great question. Let me think about this systematically. Based on my experience, I would approach this by first understanding the core requirements and constraints. I'd then evaluate different solutions, considering factors like scalability, maintainability, and user impact. I believe in data-driven decision making, so I'd also look at relevant metrics and feedback to guide the best path forward.";
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <div className="container mx-auto px-4 py-8">
        {/* Header with theme toggle */}
        <div className="flex justify-end mb-8">
          <ThemeToggle />
        </div>
        
        {/* Main content */}
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Interview Assistant
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Capture the interviewer's question and get a polished, ready-to-speak answer instantly.
            </p>
          </div>
          
          {/* Search and generate section */}
          <div className="space-y-6">
            <SearchBar 
              value={question}
              onChange={setQuestion}
              placeholder="Type or speak the interviewer's question..."
            />
            
            <div className="flex justify-center">
              <button
                onClick={handleGenerateAnswer}
                disabled={!question.trim() || isGenerating}
                className="bg-primary text-primary-foreground hover:bg-primary-hover shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 font-semibold h-14 rounded-lg px-10 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isGenerating ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    <span>Generating...</span>
                  </div>
                ) : (
                  "Generate Answer"
                )}
              </button>
            </div>
            
            {/* Answer section */}
            {showAnswer && (
              <div className="mt-8">
                <AnswerCard 
                  answer={answer}
                  question={question}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};