/**
 * What JARVIS says when woken with just its name. The first wake of a session
 * greets by time of day and, when there is an active project, offers to pick
 * it up — "we were on the Pi setup; want to continue?" Later wakes stay short.
 */

type Lang = 'en' | 'ar';

export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'night';
}

export function wakeGreeting(options: {
  firstOfSession: boolean;
  hour: number;
  lang: Lang;
  project?: { name: string; nextAction?: string };
}): string {
  const { firstOfSession, hour, lang, project } = options;
  if (!firstOfSession) return lang === 'ar' ? 'معاك.' : 'Yes?';
  const part = partOfDay(hour);
  const hello =
    lang === 'ar'
      ? part === 'morning'
        ? 'صباح الخير.'
        : 'مساء الخير.'
      : part === 'night'
        ? 'Still up, I see.'
        : `Good ${part}.`;
  if (!project) return lang === 'ar' ? `${hello} معاك.` : `${hello} What can I do?`;
  const where = project.nextAction ? `${project.name} — next was ${project.nextAction}` : project.name;
  return lang === 'ar'
    ? `${hello} كنا نعمل على ${project.name}. نكمل؟`
    : `${hello} We were on ${where}. Want to pick it up?`;
}
