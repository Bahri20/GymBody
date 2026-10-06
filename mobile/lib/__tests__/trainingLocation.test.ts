import { matchesTrainingLocation, normalizeLocation } from '../trainingLocation';

describe('training location filtering', () => {
  it('keeps the full library in gym mode', () => {
    expect(matchesTrainingLocation({ name: 'Leg Press', equipment: 'machine' }, 'gym')).toBe(true);
  });
  it('includes floor bodyweight movements without assuming missing metadata is equipment-free', () => {
    expect(matchesTrainingLocation({ name: 'Pushups', equipment: 'body only' }, 'home_bare')).toBe(true);
    expect(matchesTrainingLocation({ name: 'Unknown' }, 'home_bare')).toBe(false);
  });
  it('excludes bodyweight exercises requiring fixtures', () => {
    for (const name of ['Pullups', 'Bench Dips', 'Hanging Leg Raise', 'Hyperextensions']) {
      expect(matchesTrainingLocation({ name, equipment: 'body only' }, 'home_bare')).toBe(false);
    }
  });
  it('allows dumbbells and bands only in equipped-home mode', () => {
    const exercise = { name: 'Dumbbell Curl', equipment: 'dumbbell' };
    expect(matchesTrainingLocation(exercise, 'home_equipped')).toBe(true);
    expect(matchesTrainingLocation(exercise, 'home_bare')).toBe(false);
    expect(matchesTrainingLocation({ name: 'Dumbbell Bench Press', equipment: 'dumbbell' }, 'home_equipped')).toBe(false);
    expect(matchesTrainingLocation({ name: 'Band Curl', equipment: 'bands' }, 'home_equipped')).toBe(true);
  });
  it('normalizes persisted preferences', () => {
    expect(normalizeLocation('home_bare')).toBe('home_bare');
    expect(normalizeLocation(undefined)).toBe('gym');
    expect(normalizeLocation('invalid')).toBe('gym');
  });
});
