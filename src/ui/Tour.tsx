// Guided tour: one request from arrival to closed, narrated step by step.
// Each step names what the camera looks at and the workflow event that ends the step,
// so the tour follows the real simulation rather than a timed script.

import { useEffect } from 'react';
import type { Task } from '../sim/types';
import { actions, isNarrow, sim, useSim, useUI, type CameraFocus } from '../state/store';

interface Step {
  title: string;
  body: (t?: Task) => string;
  focus: (t?: Task) => CameraFocus;
  /** The step ends by itself when this becomes true. */
  done?: (t: Task) => boolean;
  waiting?: string;
  /** Show the request's details panel during this step. */
  details?: boolean;
  highlight?: string;
}

const STEPS: Step[] = [
  {
    title: 'This is the service desk',
    body: () => 'Five AI agents each own one step. Work moves left to right around the room, and the numbers on the floor match the progress bar on every request. You are the supervisor: the figure labelled “You”, standing in the red circle at step 5.',
    focus: () => 'overview',
  },
  {
    title: 'A request arrives',
    body: () => 'Priya in HR needs a new starter set up for Monday. The box is the request. Iris reads it, works out how urgent it is, and checks who is affected.',
    focus: () => ({ kind: 'agent', id: 'iris' }),
    done: (t) => t.stage !== 'triage',
    waiting: 'Iris is triaging',
  },
  {
    title: 'Whoever holds the box owns the work',
    body: () => 'Iris walked it over to Atlas, the planner. Atlas writes a short plan and notices one step grants an admin licence, so it flags that step as risky.',
    focus: () => ({ kind: 'agent', id: 'atlas' }),
    done: (t) => t.stage !== 'triage' && t.stage !== 'planning',
    waiting: 'Atlas is planning',
  },
  {
    title: 'Bolt does the work, but not all of it',
    body: () => 'Bolt creates the account and sets up the laptop. Partway through, Bolt walks over to check a detail with Atlas: agents ask each other questions, not just pass work on. The risky admin licence is staged, not applied. It waits for a person.',
    focus: () => ({ kind: 'agent', id: 'bolt' }),
    done: (t) => t.stage === 'review' || t.stage === 'approval' || t.stage === 'delivery' || t.stage === 'done',
    waiting: 'Bolt is executing',
  },
  {
    title: 'A different agent checks it',
    body: () => 'Sage reviews Bolt\'s work against the plan and policy. The one who makes a change is never the one who signs it off, the same rule a human team uses.',
    focus: () => ({ kind: 'agent', id: 'sage' }),
    done: (t) => t.status === 'awaiting-approval' || t.stage === 'delivery' || t.stage === 'done',
    waiting: 'Sage is reviewing',
  },
  {
    title: 'Your decision',
    body: (t) =>
      t && t.stage !== 'approval'
        ? 'You sent it back. Bolt will revise it and Sage will check it again, then it returns here.'
        : 'The request has stopped at your console. Read Sage\'s summary in the panel, then approve it, or request changes to send it back with a note.',
    focus: () => ({ kind: 'human' }),
    done: (t) => t.stage === 'delivery' || t.stage === 'done',
    details: true,
    highlight: '.approval',
  },
  {
    title: 'Echo closes it out',
    body: () => 'Echo writes a plain-language reply to Priya and closes the ticket. Nothing went out until review and your approval were done.',
    focus: () => ({ kind: 'agent', id: 'echo' }),
    done: (t) => t.status === 'done',
    waiting: 'Echo is replying',
  },
  {
    title: 'Finished, and on the record',
    body: () => 'Finished requests turn gold and build the team\'s pyramid in the middle of the room. Every handoff, output and your decision are saved in the history. Next, try a busy morning to watch towers grow on the desks, or connect a real model.',
    focus: (t) => (t ? { kind: 'task', id: t.id } : 'overview'),
    details: true,
    highlight: '.trail',
  },
];

export function Tour() {
  const tour = useUI((s) => s.tour);
  const s = useSim();
  const task = tour?.taskId ? s.tasks.find((t) => t.id === tour.taskId) : undefined;
  const step = tour ? STEPS[tour.step] : undefined;

  // Drive the camera, panels and auto-advance from the step definition.
  useEffect(() => {
    if (!tour || !step) return;
    useUI.setState({ focus: step.focus(task) });
    if (task && step.details) {
      useUI.setState({ selected: { kind: 'task', id: task.id }, follow: false, ...(isNarrow() ? { leftOpen: false } : {}) });
    } else if (task && isNarrow()) useUI.setState({ selected: null });
    else if (task) useUI.setState({ selected: { kind: 'task', id: task.id }, follow: false });
  }, [tour?.step, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tour && step?.done && task && step.done(task)) actions.tourTo(tour.step + 1);
  });

  // Glow on the part of the page the step is talking about.
  useEffect(() => {
    if (!step?.highlight) return;
    const el = document.querySelector(step.highlight);
    el?.classList.add('tour-glow');
    return () => el?.classList.remove('tour-glow');
  });

  if (!tour || !step) return null;
  const last = tour.step === STEPS.length - 1;
  const begin = () => {
    const t = actions.createTask('onboarding');
    actions.setSpeed(2);
    actions.tourTo(1, { taskId: t.id });
  };
  const waitingNow = step.done && task && !step.done(task);

  return (
    <div className="tour" role="dialog" aria-label="Guided tour" aria-live="polite">
      <div className="tour-top">
        <span className="tour-count">Step {tour.step + 1} of {STEPS.length}</span>
        <ol className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => <li key={i} className={i < tour.step ? 'done' : i === tour.step ? 'now' : ''} />)}
        </ol>
        <button className="text-btn" onClick={actions.endTour}>Skip tour</button>
      </div>
      <h2>{step.title}</h2>
      <p>{step.body(task)}</p>
      <div className="tour-actions">
        {tour.step === 0 && <button className="btn primary" onClick={begin}>Send a request</button>}
        {waitingNow && step.waiting && (
          <>
            <span className="tour-wait"><i className="spinner" />{step.waiting}</span>
            {sim.state.speed < 4 && <button className="text-btn" onClick={() => actions.setSpeed(4)}>Speed up</button>}
          </>
        )}
        {waitingNow && !step.waiting && task?.status === 'awaiting-approval' && (
          <button className="btn good" onClick={() => actions.approve(task.id, 'Approved during the tour')}>Approve</button>
        )}
        {last && (
          <>
            <button className="btn ghost" onClick={() => { actions.endTour(); useUI.getState().setTab('dashboard'); actions.busyMorning(); }}>Run a busy morning</button>
            <button className="btn primary" onClick={actions.endTour}>Finish</button>
          </>
        )}
      </div>
    </div>
  );
}
