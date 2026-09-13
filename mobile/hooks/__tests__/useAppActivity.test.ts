import { useEffect } from 'react';
import { AppState } from 'react-native';
import axios from 'axios';
import useAppActivity from '../useAppActivity';

jest.mock('react', () => ({ useEffect: jest.fn() }));
jest.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: jest.fn() } }));
jest.mock('axios', () => ({ post: jest.fn() }));

let changed: (state: string) => void;
const remove = jest.fn();
function start(token: string | null = 'token') {
  useAppActivity(token, 'https://example.test');
  return (useEffect as jest.Mock).mock.calls[0][0]();
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
  (axios.post as jest.Mock).mockResolvedValue({ status: 204 });
  (AppState.addEventListener as jest.Mock).mockImplementation((_, callback) => {
    changed = callback; return { remove };
  });
});
afterEach(() => jest.useRealTimers());

test('sends authenticated foreground heartbeats and stops after cleanup', async () => {
  const cleanup = start();
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect((axios.post as jest.Mock).mock.calls[0][2].headers.Authorization).toBe('Bearer token');
  await jest.advanceTimersByTimeAsync(60000);
  expect(axios.post).toHaveBeenCalledTimes(2);
  cleanup();
  await jest.advanceTimersByTimeAsync(120000);
  expect(axios.post).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('does not report background time and resumes when foregrounded', async () => {
  AppState.currentState = 'background';
  const cleanup = start();
  await jest.advanceTimersByTimeAsync(120000);
  expect(axios.post).not.toHaveBeenCalled();
  AppState.currentState = 'active';
  changed('active');
  expect(axios.post).toHaveBeenCalledTimes(1);
  cleanup();
});

test('does not report logged-out sessions', () => {
  start(null);
  expect(axios.post).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
});

test('retries failed requests without interrupting the app', async () => {
  (axios.post as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const cleanup = start();
  await jest.advanceTimersByTimeAsync(60000);
  expect(axios.post).toHaveBeenCalledTimes(2);
  cleanup();
});
