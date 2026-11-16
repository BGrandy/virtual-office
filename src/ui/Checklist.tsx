import { useState } from 'react';
import { actions, sim, useUI } from '../state/store';

const REPO = 'https://github.com/BGrandy/virtual-office';
const LIVE = 'https://bgrandy.github.io/virtual-office/';
const readme = (anchor: string) => `${REPO}#${anchor}`;

type Status = 'Met' | 'Not included';
type Step = { label: string; run: () => void } | { label: string; href: string };
interface Item {
  id: string;
  /** The requirement, summarised from the assessment brief. */
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

const GROUPS: { title: string; note?: string; items: Item[] }[] = [
  {
    title: 'The task',
    items: [
      {
        id: 'three-d',
        ask: 'Build a 3D interface of a virtual workplace',
        status: 'Met',
        how: 'The office is a real-time 3D room built with three.js: desks, walls, windows and a whiteboard. You can orbit, zoom and move around it, and select any agent or request box. Graphics drop to a lighter mode on slower devices so motion stays smooth.',
        see: [{ label: 'Show the whole office', run: () => { close(); useUI.getState().resetCamera(); } }],
      },
      {
        id: 'collaborate',
        ask: 'Show how AI agents collaborate',
        status: 'Met',
        how: 'Five agents each own one step: triage, plan, execute, review and reply. An agent picks the request up as a box and walks it to the next desk, and ownership changes only when the box arrives, so you can always see who has the work. The reviewer can send work back once, and risky work stops for a person to approve.',
        see: [
          { label: 'Send a request and follow it', run: followOneRequest },
          { label: 'Take the two-minute tour', run: () => actions.startTour() },
        ],
      },
    ],
  },
  {
    title: 'What to hand in',
    items: [
      {
        id: 'url',
        ask: 'A live public URL',
        status: 'Met',
        how: 'The app is a static site on GitHub Pages. Every push to the main branch runs the tests, builds the site and publishes it, so the public link always matches the code in the repository.',
        see: [
          { label: 'Open the live site', href: LIVE },
          { label: 'See the deploy runs', href: `${REPO}/actions` },
        ],
      },
      {
        id: 'repo',
        ask: 'A GitHub repository',
        status: 'Met',
        how: 'The repository is public and holds the full source, the tests, the deploy workflow and the README.',
        see: [{ label: 'Open the repository', href: REPO }],
      },
      {
        id: 'readme-arch',
        ask: 'README: architecture',
        status: 'Met',
        how: 'Four layers. A workflow engine with no interface code decides everything. A small store runs the engine and saves progress. The 3D scene and the panels only read from it. The README has the diagram, what each part is responsible for, and how a request flows through.',
        see: [{ label: 'Read the architecture section', href: readme('architecture') }],
      },
      {
        id: 'readme-stack',
        ask: 'README: tech stack',
        status: 'Met',
        how: 'React and TypeScript for the interface, three.js for the 3D scene, a small state store, and a test runner. The README lists each choice with the reason for it.',
        see: [{ label: 'Read the tech stack section', href: readme('tech-stack-and-why') }],
      },
      {
        id: 'readme-guide',
        ask: 'README: user guide',
        status: 'Met',
        how: 'The README explains every control and the four built-in scenarios. In the app, the guided tour teaches the same things in eight short steps.',
        see: [
          { label: 'Take the tour', run: () => actions.startTour() },
          { label: 'Read the user guide', href: readme('user-guide') },
        ],
      },
      {
        id: 'readme-example',
        ask: 'README: an example workflow',
        status: 'Met',
        how: 'The README walks one request from arrival to closed, including the stop for approval. The same scenario is one click away in the app.',
        see: [
          { label: 'Read the walkthrough', href: readme('example-walkthrough') },
          { label: 'Run it now', run: () => { close(); const t = actions.createTask('onboarding'); if (t) useUI.getState().select({ kind: 'task', id: t.id }, true); } },
        ],
      },
      {
        id: 'readme-real',
        ask: 'README: what is mocked and what is real',
        status: 'Met',
        how: 'Each feature is labelled working, optional, simulated or proposed, in the README and inside the app. Agent outputs are also labelled one by one as scripted or with the model that wrote them.',
        see: [
          { label: 'Open the in-app table', run: () => useUI.getState().setDialog('about') },
          { label: 'Read it in the README', href: readme('what-is-real-simulated-and-proposed') },
        ],
      },
      {
        id: 'readme-limits',
        ask: 'README: limitations',
        status: 'Met',
        how: 'The README lists what this version does not do, such as running on a server, connecting to real IT systems, or showing the same office to several people at once.',
        see: [{ label: 'Read the limitations', href: readme('limitations') }],
      },
      {
        id: 'video',
        ask: 'A recorded walkthrough (optional)',
        status: 'Not included',
        how: 'The brief makes this optional and no recording is included. The guided tour covers the same ground in about two minutes, in the live app.',
        see: [{ label: 'Take the tour instead', run: () => actions.startTour() }],
      },
    ],
  },
  {
    title: 'How it is scored',
    items: [
      {
        id: 'c-product',
        ask: 'Product and workflow understanding (30%)',
        status: 'Met',
        how: 'The office models a real IT service desk. Requests have priorities and response-time targets, the most urgent deadline is served first, risky work needs a person to approve it, and every request keeps a full history you can export. The dashboard shows where time goes, which desk is the bottleneck, and an estimate of time saved.',
        see: [
          { label: 'Open the dashboard', run: showDashboard },
          { label: 'Read how a team would use it', href: readme('how-a-real-team-would-use-it') },
        ],
      },
      {
        id: 'c-ui',
        ask: 'Interface, visualization and usability (25%)',
        status: 'Met',
        how: 'The floor is numbered 1 to 6 to match the progress bar on every request, so the room itself explains the process. Colours were checked for colour-blind viewers. The layout adapts to phones and tablets, and the hints change between mouse and touch.',
        see: [
          { label: 'Show the whole office', run: () => { close(); useUI.getState().resetCamera(); } },
          { label: 'Take the tour', run: () => actions.startTour() },
        ],
      },
      {
        id: 'c-arch',
        ask: 'Technical architecture (20%)',
        status: 'Met',
        how: 'The workflow rules live in an engine that knows nothing about the screen and is covered by 65 automated tests. When a real model is connected it only proposes; the engine still decides what happens, so approval rules cannot be talked around. The README explains how the same engine would move to a server.',
        see: [
          { label: 'Read the architecture section', href: readme('architecture') },
          { label: 'Read the path to production', href: readme('how-this-becomes-a-production-system') },
        ],
      },
      {
        id: 'c-demo',
        ask: 'Working demo and deployment (15%)',
        status: 'Met',
        how: 'Everything you can click works, and progress survives a reload. The site is rebuilt and published automatically after the tests pass. A busy morning sends many requests at once to show queues forming.',
        see: [
          { label: 'Run a busy morning', run: () => { close(); actions.busyMorning(); useUI.getState().resetCamera(); } },
          { label: 'See the deploy runs', href: `${REPO}/actions` },
        ],
      },
      {
        id: 'c-docs',
        ask: 'Documentation (10%)',
        status: 'Met',
        how: 'One README covers the idea, the user guide, a walkthrough, the architecture, the design decisions, how the result was verified, the limitations and how AI tools were used.',
        see: [{ label: 'Open the README', href: `${REPO}#readme` }],
      },
    ],
  },
  {
    title: 'Being open about the work',
    items: [
      {
        id: 'open-real',
        ask: 'Be clear about what is functional, simulated and proposed',
        status: 'Met',
        how: 'The top bar says "Simulated demo" until a model is connected. The table behind it lists every feature with its status, and no real IT system is touched in either mode.',
        see: [{ label: 'Open the table', run: () => useUI.getState().setDialog('about') }],
      },
      {
        id: 'open-ai',
        ask: 'Explain what was built, what AI helped with, and how it was checked',
        status: 'Met',
        how: 'The README says plainly which parts an AI tool wrote and what the author directed, reviewed and tested. A separate section lists how the result was verified.',
        see: [
          { label: 'Read how AI tools were used', href: readme('how-ai-tools-were-used') },
          { label: 'Read how it was verified', href: readme('how-the-result-was-verified') },
        ],
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
        Each line is a requirement from the assessment brief, summarised. Select one to see how this app meets it and where to look. {CHECKLIST_COUNTS.met} of {CHECKLIST_COUNTS.total} are met.
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
