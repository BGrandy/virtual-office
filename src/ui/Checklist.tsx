import { useState } from 'react';
import { actions, sim, useUI } from '../state/store';

const REPO = 'https://github.com/BGrandy/virtual-office';
const LIVE = 'https://bgrandy.github.io/virtual-office/';
const readme = (anchor: string) => `${REPO}#${anchor}`;

type Status = 'Met';
type Step = { label: string; run: () => void } | { label: string; href: string };
interface Item {
  id: string;
  /** The requirement, in the brief's wording, shortened. */
  ask: string;
  status: Status;
  /** How the app meets it. */
  how: string;
  /** Where to see it: something to do in the app, or a place to read. */
  see: Step[];
}

const close = () => useUI.getState().setDialog(null);

/** Sends one low-risk request and follows it, so the viewer sees a full run without having to approve anything. */
function followOneRequest() {
  close();
  const t = actions.createTask('lockout');
  if (t) useUI.getState().select({ kind: 'task', id: t.id }, true);
}

function showDashboard() {
  close();
  if (sim.state.tasks.length === 0) actions.busyMorning();
  useUI.setState({ tab: 'dashboard', leftOpen: true, selected: null });
}

const overview = () => { close(); useUI.getState().resetCamera(); };
const tour = () => actions.startTour();
/** Runs the new-hire scenario, which stops at the supervisor for approval. */
function runApprovalScenario() {
  close();
  const t = actions.createTask('onboarding');
  if (t) useUI.getState().select({ kind: 'task', id: t.id }, true);
}
function inspectAgent() {
  close();
  useUI.getState().select({ kind: 'agent', id: 'atlas' }, true);
}

/** Follows the brief section by section. Each line uses the brief's own wording, shortened. */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Notes',
    items: [
      {
        id: 'n-product',
        ask: 'Focus on product thinking and practical business applications',
        status: 'Met',
        how: 'The office is built around one real job, an IT service desk, not a generic demo. Requests have priorities and response-time targets, risky changes wait for a person, and every request keeps an exportable history. The dashboard turns a run into business terms: where time goes, which desk is the bottleneck, and how often people had to step in.',
        see: [
          { label: 'Open the dashboard', run: showDashboard },
          { label: 'Read the problem and the idea', href: readme('the-problem-and-the-idea') },
        ],
      },
      {
        id: 'n-free',
        ask: 'No paid services required',
        status: 'Met',
        how: 'Everything runs free: the site is hosted on GitHub Pages and built by GitHub Actions, and the default mode needs no account or key. Connecting a real model is optional, uses the viewer\'s own API key, and has a hard spending limit.',
        see: [{ label: 'Read the tech stack', href: readme('tech-stack-and-why') }],
      },
    ],
  },
  {
    title: '1. Objectives',
    items: [
      {
        id: 'o-office',
        ask: 'A working, browser-based 3D virtual office with multiple AI agents as team members',
        status: 'Met',
        how: 'The office is a real-time 3D room that runs in any modern browser, with nothing to install. Five agents work in it as a team, each at their own desk, alongside a human supervisor.',
        see: [{ label: 'Show the whole office', run: overview }],
      },
      {
        id: 'o-flow',
        ask: 'Show how tasks are assigned, executed, handed off, reviewed and completed',
        status: 'Met',
        how: 'A request arrives at the inbox and is assigned to the first agent. Each agent does its step, then carries the request as a box to the next desk. Partway through, an agent may walk over to ask a colleague a question, and the answer is kept in the request\'s history. The reviewer checks the work and can send it back once. Finished requests join the gold pile in the middle of the room.',
        see: [
          { label: 'Send a request and follow it', run: followOneRequest },
          { label: 'Take the two-minute tour', run: tour },
        ],
      },
    ],
  },
  {
    title: '2. Minimum demo requirements',
    items: [
      {
        id: 'm-office',
        ask: '3D office: a navigable workspace with at least 3 distinct AI agents and recognizable roles',
        status: 'Met',
        how: 'You can orbit, zoom and move around the room with a mouse or by touch. There are five agents, two more than the minimum: Iris (intake and triage), Atlas (planner), Bolt (technician), Sage (quality reviewer) and Echo (comms and records). Each has its own colour, name tag, role label and numbered desk.',
        see: [
          { label: 'Show the whole office', run: overview },
          { label: 'Read about the team', href: readme('the-team') },
        ],
      },
      {
        id: 'm-workflow',
        ask: 'Workflow visualization: an end-to-end example with task ownership, status and handoffs',
        status: 'Met',
        how: 'The flow is request, plan, execute, review, approve when risky, then complete. The floor is numbered to match the progress bar on every request. Ownership is whoever is holding the box and changes only when it arrives at the next desk. Each request shows its status, current owner and a timeline of every handoff.',
        see: [
          { label: 'Send a request and follow it', run: followOneRequest },
          { label: 'Read the task flow', href: readme('task-flow') },
        ],
      },
      {
        id: 'm-interact',
        ask: 'Interaction: initiate or select a task, inspect agent details, follow progress, view outputs',
        status: 'Met',
        how: 'Start one of four scenarios or type your own request. Select any request, in the list or as a box in the room, to see its progress, history and what each agent produced. Select an agent to see its role, current work and queue. "Follow" keeps the camera on whatever you selected.',
        see: [
          { label: 'Inspect an agent', run: inspectAgent },
          { label: 'Send a request and follow it', run: followOneRequest },
        ],
      },
      {
        id: 'm-everyday',
        ask: 'Everyday use case: how a real team would use it, and how a person supervises or intervenes',
        status: 'Met',
        how: 'You play the supervisor. Risky work stops at your console until you approve it or ask for changes. You can also hold, resume, reassign or cancel any request, and choose which work needs approval. The README describes a working day with this in a real IT team.',
        see: [
          { label: 'Run a request that needs approval', run: runApprovalScenario },
          { label: 'Read how a team would use it', href: readme('how-a-real-team-would-use-it') },
        ],
      },
      {
        id: 'm-mock',
        ask: 'Mock data: simulated behavior is clearly labeled and the workflow is understandable in the UI',
        status: 'Met',
        how: 'The top bar says "Simulated demo" until a model is connected. Every agent output is labelled "Scripted" or with the model that wrote it. No real IT system is touched in either mode. The tour, floor numbers and wall whiteboard explain the workflow without the README.',
        see: [{ label: 'Open the "what is real" table', run: () => useUI.getState().setDialog('about') }],
      },
    ],
  },
  {
    title: '3. Solution and technical explanation',
    items: [
      {
        id: 's-arch',
        ask: 'System architecture, component responsibilities and data/task flow',
        status: 'Met',
        how: 'Four layers. A workflow engine with no interface code decides everything and is covered by 68 unit tests, and 9 browser tests check the built site. A small store runs the engine and saves progress. The 3D scene and the panels only read from it and send commands. The README has the diagram, a table of what each part is responsible for, and the task flow.',
        see: [
          { label: 'Read the architecture', href: readme('architecture') },
          { label: 'Component responsibilities', href: readme('component-responsibilities') },
          { label: 'Task flow', href: readme('task-flow') },
        ],
      },
      {
        id: 's-stack',
        ask: 'Selected tech stack and why',
        status: 'Met',
        how: 'React and TypeScript for the interface, three.js for the 3D scene, a small state store, a test runner, and free static hosting. The README gives the reason for each choice.',
        see: [{ label: 'Read the tech stack and why', href: readme('tech-stack-and-why') }],
      },
      {
        id: 's-prod',
        ask: 'Production version: agent orchestration, state updates, persistence and real AI integrations',
        status: 'Met',
        how: 'The README describes each of the four. The engine moves to a server as the orchestrator, events stream to every viewer, a database holds tasks and an append-only event log, and agents become model calls with scoped tool access. The optional live AI mode already shows the model part working.',
        see: [
          { label: 'Read the path to production', href: readme('how-this-becomes-a-production-system') },
          { label: 'Connect a model', run: () => useUI.getState().setDialog('ai') },
        ],
      },
      {
        id: 's-future',
        ask: 'Clearly distinguish implemented features from future concepts',
        status: 'Met',
        how: 'Each feature is marked working, optional, simulated or proposed, in the app and in the README. The server, shared view, real tool access and ticketing integration are all marked proposed.',
        see: [
          { label: 'Open the in-app table', run: () => useUI.getState().setDialog('about') },
          { label: 'Read it in the README', href: readme('what-is-real-simulated-and-proposed') },
        ],
      },
    ],
  },
  {
    title: '4. Required deliverables',
    items: [
      {
        id: 'd-url',
        ask: 'Live preview URL, deployed to a hosting platform',
        status: 'Met',
        how: 'The app is hosted on GitHub Pages. Every push to the main branch runs the tests, builds the site and publishes it only if they pass, so the public link always matches the code in the repository.',
        see: [
          { label: 'Open the live site', href: LIVE },
          { label: 'See the deploy runs', href: `${REPO}/actions` },
        ],
      },
      {
        id: 'd-repo',
        ask: 'GitHub repository URL with source code and setup/run instructions',
        status: 'Met',
        how: 'The repository is public and holds the full source, the tests and the deploy workflow. The README gives the commands to install, run, test and build it.',
        see: [
          { label: 'Open the repository', href: REPO },
          { label: 'Read run, test and deploy', href: readme('run-test-and-deploy') },
        ],
      },
      {
        id: 'd-readme',
        ask: 'README: architecture overview, tech stack, user guide, example workflow, mock-vs-real disclosure, limitations',
        status: 'Met',
        how: 'All six are sections of one README. Each button opens that section.',
        see: [
          { label: 'Architecture', href: readme('architecture') },
          { label: 'Tech stack', href: readme('tech-stack-and-why') },
          { label: 'User guide', href: readme('user-guide') },
          { label: 'Example workflow', href: readme('example-walkthrough') },
          { label: 'Mock vs real', href: readme('what-is-real-simulated-and-proposed') },
          { label: 'Limitations', href: readme('limitations') },
        ],
      },
      {
        id: 'd-walk',
        ask: 'Short walkthrough: the user journey and key design decisions',
        status: 'Met',
        how: 'The README covers both: one section walks a request from arrival to closed, and another lists the key design decisions with the reason for each. The guided tour shows the same journey live in about two minutes.',
        see: [
          { label: 'Take the tour', run: tour },
          { label: 'Read the walkthrough', href: readme('example-walkthrough') },
          { label: 'Read the design decisions', href: readme('key-design-decisions') },
        ],
      },
    ],
  },
  {
    title: '5. Evaluation criteria',
    items: [
      {
        id: 'c-product',
        ask: 'Product and workflow understanding (30%)',
        status: 'Met',
        how: 'The workflow follows how a service desk really runs: the most urgent deadline is served first, a reviewer checks the work, risky changes need a person, and a request that fails review twice is escalated instead of looping. The dashboard shows what this would mean for a team.',
        see: [
          { label: 'Open the dashboard', run: showDashboard },
          { label: 'Run a request that needs approval', run: runApprovalScenario },
        ],
      },
      {
        id: 'c-ui',
        ask: 'UI, visualization and usability (25%)',
        status: 'Met',
        how: 'The room explains the process by itself: numbered desks, a route on the floor, boxes that stack up where work is waiting. A guided tour teaches the controls. Colours were checked for colour-blind viewers, the layout adapts to phones and tablets, and graphics lighten automatically on slower devices.',
        see: [
          { label: 'Take the tour', run: tour },
          { label: 'Run a busy morning', run: () => { close(); actions.busyMorning(); useUI.getState().resetCamera(); } },
        ],
      },
      {
        id: 'c-arch',
        ask: 'Technical architecture (20%)',
        status: 'Met',
        how: 'The workflow rules live in an engine that knows nothing about the screen, so the same engine could run on a server. When a real model is connected it only proposes; the engine still decides what happens, so approval rules cannot be talked around.',
        see: [
          { label: 'Read the architecture', href: readme('architecture') },
          { label: 'Read the path to production', href: readme('how-this-becomes-a-production-system') },
        ],
      },
      {
        id: 'c-demo',
        ask: 'Working demo and deployment (15%)',
        status: 'Met',
        how: 'Everything you can click works, and progress survives a reload. Every push runs the unit tests, builds the site, then runs browser tests against that build in headless Chrome; it is published only if all of them pass.',
        see: [
          { label: 'Send a request and follow it', run: followOneRequest },
          { label: 'See the deploy runs', href: `${REPO}/actions` },
        ],
      },
      {
        id: 'c-docs',
        ask: 'Documentation and communication (10%)',
        status: 'Met',
        how: 'One README covers the idea, the user guide, a walkthrough, the architecture, the design decisions, the limitations and the path to production. This checklist maps each line of the brief to where it is met.',
        see: [{ label: 'Open the README', href: `${REPO}#readme` }],
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
export const CHECKLIST_COUNTS = { total: ALL.length, met: ALL.filter((i) => i.status === 'Met').length };

function Row({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  const met = item.status === 'Met';
  return (
    <li className={`ck-item${open ? ' open' : ''}`}>
      <button className="ck-head" aria-expanded={open} aria-controls={`ck-${item.id}`} onClick={onToggle}>
        <span className={`ck-mark${met ? ' met' : ''}`} aria-hidden="true">{met ? '✓' : ''}</span>
        <span className="ck-ask">{item.ask}</span>
        {!met && <span className="st st-simulated">{item.status}</span>}
        <span className="ck-caret" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      {open && (
        <div className="ck-body" id={`ck-${item.id}`}>
          <p>{item.how}</p>
          <div className="ck-see">
            {item.see.map((s) =>
              'href' in s ? (
                <a key={s.label} className="btn ghost" href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
              ) : (
                <button key={s.label} className="btn primary" onClick={s.run}>{s.label}</button>
              ),
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function ChecklistBody() {
  const [open, setOpen] = useState<string | null>(ALL[0].id);
  return (
    <>
      <p className="lead">
        Every requirement in the assessment brief, in the brief's order and wording. Select one to see how this app meets it and where to look. {CHECKLIST_COUNTS.met} of {CHECKLIST_COUNTS.total} are met.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title} className="ck-group">
          <h2>{g.title}</h2>
          <ul>
            {g.items.map((i) => (
              <Row key={i.id} item={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
