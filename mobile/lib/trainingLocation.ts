export type TrainingLocation = 'gym' | 'home_bare' | 'home_equipped';
export const TRAINING_LOCATIONS: { key: TrainingLocation; label: string; icon: 'barbell-outline' | 'body-outline' | 'home-outline' }[] = [
  { key: 'gym', label: 'Salon', icon: 'barbell-outline' },
  { key: 'home_bare', label: 'Ev · ekipmansız', icon: 'body-outline' },
  { key: 'home_equipped', label: 'Ev · dambıl / bant', icon: 'home-outline' },
];
export function normalizeLocation(value: unknown): TrainingLocation {
  return value === 'home_bare' || value === 'home_equipped' ? value : 'gym';
}
export function matchesTrainingLocation(exercise: { name?: string; equipment?: string }, location: TrainingLocation): boolean {
  if (location === 'gym') return true;
  const equipment = (exercise.equipment || '').toLowerCase().trim();
  const name = (exercise.name || '').toLowerCase();
  // Bodyweight metadata can still require a pull-up bar, bench, station or partner.
  if (/bench|pull.?up|chin.?up|dip|hanging|hyperextension|roman chair|glute.ham|partner|suspension|smith|machine|cable|barbell|box jump|incline|decline|preacher|seated|exercise ball|feet elevated|step.up|pullover|dumbbell fly|tate press|gorilla|body tricep press|towel|off of a dumbbell/.test(name)) return false;
  if (equipment === 'body only' || equipment === 'none' || equipment === 'bodyweight') return true;
  return location === 'home_equipped' && ['dumbbell', 'bands', 'resistance band'].includes(equipment);
}
