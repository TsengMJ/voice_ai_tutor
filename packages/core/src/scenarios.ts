export interface Goal {
  id: string;
  text: string;
}

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  setting: string;
  tutorRole: string;
  learnerRole: string;
  goals: Goal[];
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'coffee-order',
    title: 'Ordering coffee',
    tagline: 'Order a drink just the way you like it.',
    level: 'Beginner',
    setting: 'A busy neighborhood café on a weekday morning.',
    tutorRole: 'a friendly barista',
    learnerRole: 'a customer',
    goals: [
      { id: 'greet', text: 'Greet the barista' },
      { id: 'order', text: 'Order a drink with one customization' },
      { id: 'pay', text: 'Ask how much it is and pay' },
    ],
  },
  {
    id: 'weekend-plans',
    title: 'Making weekend plans',
    tagline: 'Invite a friend out and agree on the details.',
    level: 'Intermediate',
    setting: 'Chatting with a friend on a Friday afternoon.',
    tutorRole: 'your friend Sam',
    learnerRole: "Sam's friend",
    goals: [
      { id: 'invite', text: 'Invite Sam to do something' },
      { id: 'time', text: 'Suggest a day and time' },
      { id: 'place', text: 'Agree on where to meet' },
    ],
  },
  {
    id: 'interview-small-talk',
    title: 'Job interview small talk',
    tagline: 'Make a confident first impression.',
    level: 'Advanced',
    setting: 'The first few minutes of an in-person job interview.',
    tutorRole: 'Alex, the hiring manager',
    learnerRole: 'a candidate',
    goals: [
      { id: 'introduce', text: 'Introduce yourself' },
      { id: 'background', text: 'Describe your current role or studies' },
      { id: 'question', text: 'Ask Alex a question about the team' },
    ],
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getScenario(id: string): Scenario {
  const scenario = findScenario(id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
