import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// sample_playlist.csvの内容を反映
const csvTracks = [
  { track_title: '雨とカプチーノ', artist: 'ヨルシカ', youtube_video_id: '_6DnZ8QQehA', start_time: 0, end_time: 270 },
  { track_title: 'Yummy Yummy Yummy', artist: 'FAKE TYPE', youtube_video_id: 'qSaaaTqOsvU', start_time: 0, end_time: 169 },
  { track_title: '明日も', artist: 'SHISHAMO', youtube_video_id: 'PKEbUUPNi3I', start_time: 0, end_time: 365 },
  { track_title: '小さな恋のうた', artist: 'MONGOL800', youtube_video_id: 'Al2hm6tlsII', start_time: 0, end_time: 219 },
  { track_title: 'きゅうくらりん', artist: 'いよわ feat.可不 ', youtube_video_id: 'vSr8PqrXRHc', start_time: 0, end_time: 216 },
  { track_title: 'Mr. Showtime', artist: 'ワンダーランズ×ショウタイム × 巡音ルカ', youtube_video_id: 'xGxZVVRQ3Qs', start_time: 0, end_time: 230 },
  { track_title: 'Mr. Music', artist: 'れるりり', youtube_video_id: 'BTFo78i4rJo', start_time: 56, end_time: 324 },
  { track_title: 'Climax Jump', artist: 'AAA', youtube_video_id: 'BTFo78i4rJo', start_time: 536, end_time: 775 },
  { track_title: 'くっきんどりーみんらんど', artist: 'Speciale', youtube_video_id: 'v5ebL2NFJU0', start_time: 0, end_time: 232 },
  { track_title: 'シュガーソングとビターステップ', artist: 'UNISON SQUARE GARDEN', youtube_video_id: 'u7h7UL9cR_g', start_time: 0, end_time: 255 },
  { track_title: 'にっこり^^調査隊のテーマ', artist: 'Speciale', youtube_video_id: 'GKCyuUkI7mI', start_time: 0, end_time: 207 },
];

// tracks配列はAPIから取得
function App() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 区間内の再生位置（秒）
  const [iframeKey, setIframeKey] = useState(0); // iframe再生成用
  const [seekedProgress, setSeekedProgress] = useState<number | null>(null); // シーク確定用
  const [showFilter, setShowFilter] = useState(false);
  const [selectedVocalist, setSelectedVocalist] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [pendingCategory, setPendingCategory] = useState<string>('');
  const [pendingVocalist, setPendingVocalist] = useState<string>('');
  const [isRandom, setIsRandom] = useState(false); // ランダム再生ON/OFF
  const [isRepeat, setIsRepeat] = useState(false); // リピート再生ON/OFF
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/playlists')
      .then(res => res.json())
      .then(data => {
        setTracks(
          data.map((t: any) => ({
            videoId: t.youtube_video_id,
            thumbnail: `https://img.youtube.com/vi/${t.youtube_video_id}/maxresdefault.jpg`,
            track_title: t.track_title,
            artist: t.artist,
            vocalist: t.vocalist,
            category: t.category, // カテゴリを追加
            start_time: Number(t.start_time),
            end_time: Number(t.end_time),
          }))
        );
      });
  }, []);

  useEffect(() => {
    function updateVideoHeight() {
      if (window.innerWidth >= 900 && videoAreaRef.current) {
        const width = videoAreaRef.current.offsetWidth;
        videoAreaRef.current.style.height = `${width * 9 / 16}px`;
      } else if (videoAreaRef.current) {
        videoAreaRef.current.style.height = '';
      }
    }
    window.addEventListener('resize', updateVideoHeight);
    updateVideoHeight();
    setTimeout(updateVideoHeight, 0);
    return () => window.removeEventListener('resize', updateVideoHeight);
  }, [tracks]);

  // vocalist一覧を抽出（カンマ区切りも分割、重複除去）
  const vocalistSet = new Set<string>();
  tracks.forEach(t => {
    if (t.vocalist) {
      t.vocalist.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => vocalistSet.add(v));
    }
  });
  const vocalistList = Array.from(vocalistSet).sort();

  // フィルタ適用
  const filteredTracks = tracks.filter(t => {
    const matchCategory = !selectedCategory || t.category === selectedCategory;
    const matchVocalist = !selectedVocalist || (t.vocalist && t.vocalist.split(',').map((v: string) => v.trim()).includes(selectedVocalist));
    return matchCategory && matchVocalist;
  });

  // フィルタプレビュー（pending状態）
  const previewTracks = tracks.filter(t => {
    const matchCategory = !pendingCategory || t.category === pendingCategory;
    const matchVocalist = !pendingVocalist || (t.vocalist && t.vocalist.split(',').map((v: string) => v.trim()).includes(pendingVocalist));
    return matchCategory && matchVocalist;
  });

  // トラック切り替え時や停止時にprogressリセット
  useEffect(() => {
    setProgress(0);
    setSeekedProgress(null);
    setIframeKey((k) => k + 1); // iframe再生成
  }, [currentTrackIdx]);

  // ランダムで次のインデックスを取得（現在の曲以外）
  const getRandomIndex = () => {
    if (filteredTracks.length <= 1) return currentTrackIdx;
    let idx;
    do {
      idx = Math.floor(Math.random() * filteredTracks.length);
    } while (idx === currentTrackIdx);
    return idx;
  };

  // 再生区間が終わったら次の動画へ
  useEffect(() => {
    const currentTrack = filteredTracks[currentTrackIdx];
    if (!currentTrack || !isPlaying) return;
    const duration = currentTrack.end_time - currentTrack.start_time;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    const remain = (duration - progress) * 1000;
    timeoutRef.current = setTimeout(() => {
      if (isRepeat) {
        // 一度停止→再生でYouTube埋め込みの自動再生を確実にする
        setIsPlaying(false);
        setTimeout(() => {
          setProgress(0);
          setSeekedProgress(null);
          setIframeKey(k => k + 1); // iframe再生成
          setIsPlaying(true);
          setAutoplay(true);
        }, 100); // 100ms遅延
      } else if (isRandom) {
        setCurrentTrackIdx(getRandomIndex());
        setAutoplay(true);
        setIsPlaying(true);
        setProgress(0);
      } else if (currentTrackIdx < filteredTracks.length - 1) {
        setCurrentTrackIdx(currentTrackIdx + 1);
        setAutoplay(true);
        setIsPlaying(true);
        setProgress(0);
      } else {
        setIsPlaying(false); // 最後の動画で止める
        setProgress(0);
      }
    }, remain);
    // シークバー用インターバル
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev + 0.2 >= duration) return duration;
        return prev + 0.2;
      });
    }, 200);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIdx, filteredTracks, isPlaying, progress, isRandom, isRepeat]);

  const currentTrack = filteredTracks[currentTrackIdx];
  if (!currentTrack) {
    return <div>Loading...</div>;
  }
  const duration = currentTrack.end_time - currentTrack.start_time;

  // YouTube埋め込みURL生成
  const getYoutubeUrl = () => {
    let url = `https://www.youtube.com/embed/${currentTrack.videoId}`;
    const params = [];
    params.push('controls=0'); // UI非表示
    if (isPlaying) params.push('autoplay=1');
    // シーク確定時はseekedProgressを使う
    const seek = seekedProgress !== null ? seekedProgress : 0;
    if (currentTrack.start_time !== undefined) params.push(`start=${currentTrack.start_time + Math.floor(seek)}`);
    if (currentTrack.end_time !== undefined) params.push(`end=${currentTrack.end_time}`);
    if (params.length > 0) url += '?' + params.join('&');
    return url;
  };

  // 再生・一時停止
  const handlePlay = () => {
    setIsPlaying(true);
    setAutoplay(true);
  };
  const handlePause = () => {
    setIsPlaying(false);
    setAutoplay(false);
  };
  // 次・前
  const handleNext = () => {
    if (isRandom) {
      setCurrentTrackIdx(getRandomIndex());
      setAutoplay(true);
      setIsPlaying(true);
      setProgress(0);
    } else if (currentTrackIdx < filteredTracks.length - 1) {
      setCurrentTrackIdx(currentTrackIdx + 1);
      setAutoplay(true);
      setIsPlaying(true);
      setProgress(0);
    }
  };
  const handlePrev = () => {
    if (isRandom) {
      setCurrentTrackIdx(getRandomIndex());
      setAutoplay(true);
      setIsPlaying(true);
      setProgress(0);
    } else if (currentTrackIdx > 0) {
      setCurrentTrackIdx(currentTrackIdx - 1);
      setAutoplay(true);
      setIsPlaying(true);
      setProgress(0);
    }
  };

  // シークバー操作
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProgress(Number(e.target.value));
  };
  // シーク確定時（マウス離し/タッチ離し）
  const handleSeekCommit = () => {
    setSeekedProgress(progress);
    setIframeKey((k) => k + 1); // iframe再生成
    setAutoplay(true);
    setIsPlaying(true);
    // タイマー再設定
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    const remain = (duration - progress) * 1000;
    timeoutRef.current = setTimeout(() => {
      if (currentTrackIdx < filteredTracks.length - 1) {
        setCurrentTrackIdx(currentTrackIdx + 1);
        setAutoplay(true);
        setIsPlaying(true);
        setProgress(0);
        setSeekedProgress(null);
      } else {
        setIsPlaying(false); // 最後の動画で止める
        setProgress(0);
        setSeekedProgress(null);
      }
    }, remain);
    // シークバー用インターバル
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev + 0.2 >= duration) return duration;
        return prev + 0.2;
      });
    }, 200);
  };

  // リストクリック
  const handleTrackClick = (idx: number) => {
    setCurrentTrackIdx(idx);
    setAutoplay(true);
    setIsPlaying(true);
    setProgress(0);
    setSeekedProgress(null);
  };

  return (
    <div className="App" style={{ fontFamily: 'sans-serif', background: '#f9f9f9', height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ヘッダー */}
      <header>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '16px' }}>Speciale Music</span>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowFilter(f => {
              // フィルタパネルを開くときはpending値を現在値で初期化
              if (!f) {
                setPendingCategory(selectedCategory);
                setPendingVocalist(selectedVocalist);
              }
              return !f;
            })}
            style={{
              ...iconBtnStyle,
              width: 40,
              height: 40,
              margin: '0 4px',
              color: '#FEFCF5',
              background: showFilter ? 'rgba(97, 218, 251, 0.15)' : 'none',
              borderRadius: '4px',
              transition: 'background 0.2s',
            }}
            aria-label="ボーカリストでフィルタ"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          {showFilter && (
            <div className="filter-modal-overlay" onClick={() => setShowFilter(false)}>
              <div className="filter-modal-content" style={{ maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                {/* カテゴリフィルタ */}
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>カテゴリ</div>
                <div className="custom-radio-group">
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="" checked={pendingCategory === ''} onChange={() => setPendingCategory('')} />
                    <span className="custom-radio-custom" /> すべて
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="utamita" checked={pendingCategory === 'utamita'} onChange={() => setPendingCategory('utamita')} />
                    <span className="custom-radio-custom" /> 歌ってみた
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="utawaku" checked={pendingCategory === 'utawaku'} onChange={() => setPendingCategory('utawaku')} />
                    <span className="custom-radio-custom" /> 歌枠
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="original" checked={pendingCategory === 'original'} onChange={() => setPendingCategory('original')} />
                    <span className="custom-radio-custom" /> オリジナル
                  </label>
                </div>
                {/* ボーカリストフィルタ */}
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>ボーカリスト</div>
                <div className="custom-radio-group" style={{ marginBottom: 8 }}>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="vocalist" value="" checked={pendingVocalist === ''} onChange={() => setPendingVocalist('')} />
                    <span className="custom-radio-custom" /> すべて
                  </label>
                  {vocalistList.map(v => (
                    <label key={v} className="custom-radio-label">
                      <input className="custom-radio-input" type="radio" name="vocalist" value={v} checked={pendingVocalist === v} onChange={() => setPendingVocalist(v)} />
                      <span className="custom-radio-custom" /> {v}
                    </label>
                  ))}
                </div>
                {/* 決定ボタン */}
                <button
                  style={{ width: '100%', padding: '8px', background: previewTracks.length === 0 ? '#ccc' : '#1976d2', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: previewTracks.length === 0 ? 'not-allowed' : 'pointer', marginTop: 8 }}
                  disabled={previewTracks.length === 0}
                  onClick={() => {
                    setSelectedCategory(pendingCategory);
                    setSelectedVocalist(pendingVocalist);
                    setShowFilter(false);
                    setCurrentTrackIdx(0);
                  }}
                >
                  決定
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Youtube動画 */}
      <div className="main-content" style={{flex: 1, minHeight: 0}}>
        <div className="video-area" ref={videoAreaRef}>
          {isPlaying ? (
            <iframe
              key={iframeKey}
              width="100%"
              height="100%"
              src={getYoutubeUrl()}
              title="YouTube video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
          ) : (
            <div className="video-thumbnail-wrapper">
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.track_title}
                className="video-thumbnail"
              />
            </div>
          )}
        </div>
        <div className="list-area">
          {filteredTracks.map((track, idx) => (
            <div
              key={idx}
              className={`track-item${currentTrackIdx === idx ? ' selected' : ''}`}
              onClick={() => handleTrackClick(idx)}
            >
              <img
                src={track.thumbnail}
                alt={track.track_title}
                style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: '4px', marginRight: '8px' }}
              />
              <div style={{ minWidth: 0, overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                <div className="track-title">{track.track_title}</div>
                {/* <div className="track-artist">{track.artist}</div> */}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* フッター操作パネル */}
      <footer>
        <div style={{ position: 'absolute', left: 16, bottom: 24, display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              setIsRandom(r => {
                const next = !r;
                if (next) setIsRepeat(false); // ランダムOn時リピートOff
                return next;
              });
            }}
            style={{
              ...iconBtnStyle,
              width: 32,
              height: 32,
              color: isRandom ? '#61dafb' : '#FEFCF5',
              background: isRandom ? 'rgba(97, 218, 251, 0.15)' : 'none',
              border: 'none',
              margin: 0,
              padding: 0,
              opacity: isRandom ? 1 : 0.7,
              borderRadius: '4px',
              transition: 'color 0.2s, opacity 0.2s, background 0.2s',
            }}
            aria-label="ランダム再生切替"
          >
            {/* シャッフルアイコン SVG */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>
          <button
            onClick={() => {
              setIsRepeat(r => {
                const next = !r;
                if (next) setIsRandom(false); // リピートOn時ランダムOff
                return next;
              });
            }}
            style={{
              ...iconBtnStyle,
              width: 32,
              height: 32,
              color: isRepeat ? '#61dafb' : '#FEFCF5',
              background: isRepeat ? 'rgba(97, 218, 251, 0.15)' : 'none',
              border: 'none',
              margin: 0,
              padding: 0,
              opacity: isRepeat ? 1 : 0.7,
              borderRadius: '4px',
              transition: 'color 0.2s, opacity 0.2s, background 0.2s',
            }}
            aria-label="リピート切替"
          >
            {/* リピートアイコン SVG */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
        {/* シークバー */}
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={progress}
          onChange={handleSeek}
          onMouseUp={handleSeekCommit}
          onTouchEnd={handleSeekCommit}
          style={{ width: '100%', margin: '12px 0 12px 0', accentColor: '#61dafb', height: 4 }}
        />
        {/* 楽曲情報と操作ボタン（縦並び） */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* 再生中のサムネ・情報 */}
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, marginBottom: 4, width: '100%', justifyContent: 'center' }}>
            <img src={currentTrack.thumbnail} alt={currentTrack.track_title} style={{ width: 40, height: 24, objectFit: 'cover', borderRadius: '4px', marginRight: 8 }} />
            <div style={{ color: '#fff', fontSize: '0.95rem', minWidth: 0, overflow: 'hidden', flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{currentTrack.track_title}</div>
              {/* <div style={{ fontSize: '0.85rem', color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{currentTrack.artist}</div> */}
            </div>
          </div>
          {/* 操作ボタン（縦並び） */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button onClick={handlePrev} disabled={isRepeat || currentTrackIdx === 0} style={{
              ...iconBtnStyle,
              opacity: isRepeat || currentTrackIdx === 0 ? 0.4 : 1,
            }} aria-label="前">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>
            {isPlaying ? (
              <button onClick={handlePause} style={iconBtnStyle} aria-label="一時停止">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              </button>
            ) : (
              <button onClick={handlePlay} style={iconBtnStyle} aria-label="再生">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            )}
            <button onClick={handleNext} disabled={isRepeat || currentTrackIdx === filteredTracks.length - 1} style={{
              ...iconBtnStyle,
              opacity: isRepeat || currentTrackIdx === filteredTracks.length - 1 ? 0.4 : 1,
            }} aria-label="次">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  margin: '0 4px',
  padding: 0,
  cursor: 'pointer',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'opacity 0.2s',
  height: 32,
  width: 32,
};

export default App;
