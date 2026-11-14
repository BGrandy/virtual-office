// Domain model shared by the simulation engine and the UI.
// Everything in SimState is plain JSON so it can be persisted, replayed,
// or (in a production version) sent from a server over a WebSocket.

export type AgentId = 'iris' | 'atlas' | 'bolt' | 'sage' | 'echo';
export type Actor = AgentId | 'human';

/** Where a task is in the workflow. */
export type Stage = 'triage' | 'planning' | 'execution' | 'review' | 'approval' | 'delivery' | 'done';
/** Stages an AI agent performs (approval belongs to the human, done is terminal). */
export type WorkStage = 'triage' | 'planning' | 'execution' | 'review' | 'delivery';

export type TaskStatus =
  | 'queued' // waiting on its owner's desk
  | 'active' // owner is working on it
  | 'handoff' // being carried to the next owner
  | 'awaiting-approval' // parked at the supervisor console
  | 'done'
  | 'cancelled';

export type Priority = 'P1' | 'P2' | 'P3';
export type Vec2 = [number, number];
export type ApprovalPolicy = 'risky' | 'all';

export interface Output {
  stage: Stage;
  by: Actor;
  title: string;
  body: string;
  t: number;
  kind?: 'ok' | 'changes';
  /** Who wrote the text: a script, a live model, or the supervisor. */
  source?: 'script' | 'ai' | 'human' | 'fallback';
  model?: string;
}

/** How a task's stage work is produced. */
export type ExecMode = 'script' | 'ai';

/** Result of one live model call for one stage pass. Written by the AI layer, read by the engine. */
export interface AIStageResult {
  status: 'pending' | 'done' | 'error';
  steps?: string[];
  body?: string;
  verdict?: 'pass' | 'changes' | 'escalate';
  risky?: boolean;
  riskReason?: string;
  priority?: Priority;
  error?: string;
  model?: string;
  logged?: boolean;
}

/** One visit to one stage. Drives the dashboard: wait = started - arrived, work = finished - started. */
export interface StageSpan {
  stage: Stage;
  owner: Actor | 'archive';
  arrived: number;
  started?: number;
  finished?: number;
}

export interface Handoff {
  from: Actor;
  to: Actor | 'archive';
  fromStage: Stage;
  toStage: Stage;
  t: number;
  note?: string;
  kind: 'handoff' | 'rework' | 'reassign' | 'approval';
}

export interface Task {
  id: string;
  templateId: string;
  title: string;
  requester: string;
  priority: Priority;
  colorIndex: number;
  stage: Stage;
  status: TaskStatus;
  ownerId: Actor;
  /** 0..1 progress through the current stage. */
  progress: number;
  held: boolean;
  /** How many times the task has been sent back to execution. */
  rework: number;
  reworkBy?: Actor;
  humanNote?: string;
  /** Set while the task is being carried. */
  next?: { stage: Stage; ownerId: Actor; kind: Handoff['kind']; note?: string };
  history: Handoff[];
  outputs: Output[];
  timeline: StageSpan[];
  mode: ExecMode;
  /** Live model results keyed by `${stage}:${rework}`. */
  ai: Record<string, AIStageResult>;
  /** Why this task stopped for approval, set when it is gated. */
  riskReason?: string;
  /** Set when the live planner flags the work as risky. */
  aiRisky?: boolean;
  /** Set once when the request passes its response-time target while still open. */
  slaBreached?: boolean;
  createdAt: number;
  completedAt?: number;
}

export type AgentActivity = 'idle' | 'working' | 'carrying' | 'returning';

export interface AgentState {
  id: AgentId;
  pos: Vec2;
  heading: number;
  activity: AgentActivity;
  taskId?: string;
  path: Vec2[];
  /** Short line shown in the agent's speech bubble. */
  say?: string;
  stagesCompleted: number;
  /** Simulated seconds spent working or carrying. */
  busy: number;
}

export type EventType =
  | 'created' | 'started' | 'step' | 'output' | 'handoff' | 'rework'
  | 'approval-requested' | 'approved' | 'rejected' | 'completed'
  | 'held' | 'resumed' | 'cancelled' | 'reassigned' | 'policy' | 'ai-error' | 'sla-breach';

export interface SimEvent {
  id: number;
  t: number;
  type: EventType;
  text: string;
  taskId?: string;
  actor?: Actor;
}

export interface SimState {
  version: number;
  time: number;
  speed: number;
  paused: boolean;
  policy: ApprovalPolicy;
  seq: number;
  nextTicket: number;
  agents: Record<AgentId, AgentState>;
  tasks: Task[];
  events: SimEvent[];
}
