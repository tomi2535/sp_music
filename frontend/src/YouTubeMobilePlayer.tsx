import React, { useEffect, useRef, useState } from 'react';

// サンプル動画ID
const VIDEO_IDS = [
  'hY7m5jjJ9mM', // Keyboard Cat（埋め込みOKな有名サンプル）
  'aqz-KE-bpKQ', // Big Buck Bunny (公式サンプル)
  'ScMzIvxBSi4', // Tears of Steel (公式サンプル)
];

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const YouTubeMobilePlayer: React.FC = () => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const playerRef = useRef<any>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);

  // IFrame API読み込み
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => {
      setYtReady(true);
    };
    return () => {
      delete (window as any).onYouTubeIframeAPIReady;
    };
  }, []);

  // プレイヤー生成（1回だけ）
  useEffect(() => {
    if (!ytReady || !iframeContainerRef.current) return;
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player(iframeContainerRef.current, {
      height: '100%',
      width: '100%',
      videoId: VIDEO_IDS[currentIdx],
      playerVars: {
        controls: 0,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          setPlayerReady(true);
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            setIsPlaying(false);
          }
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady]);

  // 再生ボタン
  const handlePlay = () => {
    if (playerRef.current && playerReady) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };
  // 一時停止
  const handlePause = () => {
    if (playerRef.current && playerReady) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  };
  // 次へ
  const handleNext = () => {
    if (currentIdx < VIDEO_IDS.length - 1 && playerRef.current && playerReady) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      playerRef.current.loadVideoById({ videoId: VIDEO_IDS[nextIdx] });
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };
  // 戻る
  const handlePrev = () => {
    if (currentIdx > 0 && playerRef.current && playerReady) {
      const prevIdx = currentIdx - 1;
      setCurrentIdx(prevIdx);
      playerRef.current.loadVideoById({ videoId: VIDEO_IDS[prevIdx] });
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 16, background: '#222', borderRadius: 12, color: '#fff' }}>
      <h2 style={{ textAlign: 'center' }}>YouTube Mobile Player サンプル</h2>
      <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000', borderRadius: 8, marginBottom: 16 }}>
        <div ref={iframeContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={handlePrev} disabled={currentIdx === 0} style={{ fontSize: 18, padding: '8px 16px' }}>戻る</button>
        {isPlaying ? (
          <button onClick={handlePause} style={{ fontSize: 18, padding: '8px 16px' }}>一時停止</button>
        ) : (
          <button onClick={handlePlay} style={{ fontSize: 18, padding: '8px 16px' }}>再生</button>
        )}
        <button onClick={handleNext} disabled={currentIdx === VIDEO_IDS.length - 1} style={{ fontSize: 18, padding: '8px 16px' }}>次へ</button>
      </div>
      <div style={{ textAlign: 'center', fontSize: 16 }}>
        動画 {currentIdx + 1} / {VIDEO_IDS.length}
      </div>
      <div style={{ textAlign: 'center', fontSize: 13, marginTop: 8, color: '#aaa' }}>
        ※モバイルで「再生」ボタンを押したときに動画が再生されるか、次へ/戻るで自動再生されるか検証してください。
      </div>
    </div>
  );
};

export default YouTubeMobilePlayer; 