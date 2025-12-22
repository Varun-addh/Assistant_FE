import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Code2, 
  Layers, 
  MessageCircle, 
  Briefcase, 
  Brain, 
  Database, 
  Smartphone, 
  Server, 
  Shield, 
  Cloud, 
  Award,
  Clock,
  Target,
  TrendingUp,
} from 'lucide-react';
import { InterviewRound } from '@/lib/practiceModeApi';

interface RoundInfo {
  round: InterviewRound;
  name: string;
  icon: any;
  duration: number;
  questions: number;
  difficulty: string;
  color: string;
  description: string;
  focusAreas: string[];
}

const ROUND_INFO: RoundInfo[] = [
  {
    round: InterviewRound.HR_SCREENING,
    name: 'HR Screening',
    icon: Users,
    duration: 20,
    questions: 4,
    difficulty: 'Easy',
    color: 'from-blue-500 to-cyan-500',
    description: 'Initial conversation about background, motivation, and culture fit',
    focusAreas: ['Background Check', 'Motivation', 'Culture Fit', 'Salary Expectations'],
  },
  {
    round: InterviewRound.TECHNICAL_ROUND_1,
    name: 'Technical Round 1',
    icon: Code2,
    duration: 45,
    questions: 6,
    difficulty: 'Medium',
    color: 'from-green-500 to-emerald-500',
    description: 'Core technical concepts and basic problem-solving',
    focusAreas: ['Data Structures', 'Algorithms', 'Coding Problems', 'Technical Fundamentals'],
  },
  {
    round: InterviewRound.TECHNICAL_ROUND_2,
    name: 'Technical Round 2',
    icon: Code2,
    duration: 60,
    questions: 6,
    difficulty: 'Hard',
    color: 'from-red-500 to-pink-500',
    description: 'Advanced technical questions and complex problem-solving',
    focusAreas: ['Complex Algorithms', 'System Optimization', 'Advanced Concepts', 'Edge Cases'],
  },
  {
    round: InterviewRound.SYSTEM_DESIGN,
    name: 'System Design',
    icon: Layers,
    duration: 60,
    questions: 3,
    difficulty: 'Hard',
    color: 'from-purple-500 to-indigo-500',
    description: 'Large-scale system architecture and design principles',
    focusAreas: ['Scalability', 'Reliability', 'Architecture', 'Trade-offs'],
  },
  {
    round: InterviewRound.BEHAVIORAL,
    name: 'Behavioral',
    icon: MessageCircle,
    duration: 40,
    questions: 5,
    difficulty: 'Medium',
    color: 'from-yellow-500 to-orange-500',
    description: 'Past experiences, teamwork, and situational responses',
    focusAreas: ['Leadership', 'Teamwork', 'Conflict Resolution', 'Problem Solving'],
  },
  {
    round: InterviewRound.MANAGERIAL,
    name: 'Managerial',
    icon: Briefcase,
    duration: 45,
    questions: 4,
    difficulty: 'Hard',
    color: 'from-teal-500 to-cyan-500',
    description: 'Leadership, team management, and strategic thinking',
    focusAreas: ['Team Leadership', 'Strategic Planning', 'Stakeholder Management', 'Decision Making'],
  },
  {
    round: InterviewRound.FULL_INTERVIEW,
    name: 'Full Interview',
    icon: Award,
    duration: 240,
    questions: 20,
    difficulty: 'Mixed',
    color: 'from-gradient-to-r from-purple-600 to-pink-600',
    description: 'Complete interview experience covering all aspects',
    focusAreas: ['All Round Types', 'Comprehensive Assessment', 'Endurance', 'Versatility'],
  },
];

export default function RoundInfoGuide() {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold">Interview Round Types</h3>
        <p className="text-muted-foreground">
          Choose a round that matches your preparation stage
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROUND_INFO.map((info) => {
          const Icon = info.icon;
          return (
            <Card key={info.round} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${info.color}`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <CardTitle className="text-lg">{info.name}</CardTitle>
                </div>
                <CardDescription className="text-sm">{info.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {info.duration} min
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <Target className="w-3 h-3 mr-1" />
                    {info.questions} questions
                  </Badge>
                  <Badge className={`text-xs ${
                    info.difficulty === 'Easy' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    info.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    info.difficulty === 'Hard' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {info.difficulty}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Key Focus:</p>
                  <div className="flex flex-wrap gap-1">
                    {info.focusAreas.map((area, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            Recommended Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Badge className="mt-1">Entry</Badge>
              <p className="text-sm">
                Start with <span className="font-semibold">HR Screening</span> → 
                <span className="font-semibold"> Technical Round 1</span> → 
                <span className="font-semibold"> Behavioral</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="mt-1">Mid</Badge>
              <p className="text-sm">
                Focus on <span className="font-semibold">Technical Round 2</span> → 
                <span className="font-semibold"> System Design</span> → 
                <span className="font-semibold"> Specialist Rounds</span>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Badge className="mt-1">Senior</Badge>
              <p className="text-sm">
                Master <span className="font-semibold">System Design</span> → 
                <span className="font-semibold"> Managerial</span> → 
                <span className="font-semibold"> Full Interview</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
