/** Minimal YouTube IFrame API globals */
export {}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }

  interface YTNamespace {
    Player: new (id: string | HTMLElement, opts: YTPlayerOptions) => YTPlayer
    PlayerState?: { PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
  }

  interface YTPlayerOptions {
    videoId?: string
    playerVars?: Record<string, string | number>
    events?: {
      onReady?: (e: { target: YTPlayer }) => void
      onStateChange?: (e: { data: number; target: YTPlayer }) => void
      onError?: (e: unknown) => void
    }
  }

  interface YTPlayer {
    destroy(): void
    playVideo(): void
    pauseVideo(): void
    seekTo(seconds: number, allowSeekAhead?: boolean): void
    getCurrentTime(): number
    getPlayerState(): number
    mute(): void
    unMute(): void
  }
}
