import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Papa from 'papaparse';
import { announcements } from './announcement';
import { getCurrentTheme, ColorTheme } from './skins';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

function App() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 区間内の再生位置（秒）
  const [showFilter, setShowFilter] = useState(false);
  const [selectedVocalist, setSelectedVocalist] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [pendingCategory, setPendingCategory] = useState<string>('');
  const [pendingVocalist, setPendingVocalist] = useState<string>('');
  const [isRandom, setIsRandom] = useState(false); // ランダム再生ON/OFF
  const [isRepeat, setIsRepeat] = useState(false); // リピート再生ON/OFF
  const [isSeeking, setIsSeeking] = useState(false); // シーク中かどうかのフラグ
  const [isVideoHidden, setIsVideoHidden] = useState(false); // 動画領域の表示/非表示
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900); // モバイルレイアウトかどうか
  const [showAnnouncement, setShowAnnouncement] = useState(false); // お知らせモーダルの表示/非表示
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // ユーザーインタラクションの有無
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoAreaRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const currentTrackIdxRef = useRef<number>(0); // 最新のcurrentTrackIdxを保持
  const isRepeatRef = useRef<boolean>(false); // 最新のisRepeatを保持
  const isRandomRef = useRef<boolean>(false); // 最新のisRandomを保持
  const playerReadyRef = useRef<boolean>(false); // 最新のplayerReadyを保持
  const listAreaRef = useRef<HTMLDivElement>(null); // リストエリアのref
  const [isUserScrolling, setIsUserScrolling] = useState(false); // ユーザーが手動スクロール中かどうか
  const [ytReady, setYtReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [initAttempts, setInitAttempts] = useState(0);
  const maxInitAttempts = 5;
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(getCurrentTheme(''));
  const [filterModalTheme, setFilterModalTheme] = useState<ColorTheme>(getCurrentTheme(''));

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

  // vocalist一覧を抽出（カンマ区切りも分割、重複除去）
  const vocalistSet = new Set<string>();
  tracks.forEach(t => {
    if (t.vocalist) {
      t.vocalist.split(',').map((v: string) => v.trim()).filter(Boolean).forEach((v: string) => vocalistSet.add(v));
    }
  });
  const vocalistList = Array.from(vocalistSet).sort();

  // 現在の楽曲を取得
  const currentTrack = filteredTracks[currentTrackIdx];

  // 楽曲の再生時間を計算
  const duration = currentTrack ? currentTrack.end_time - currentTrack.start_time : 0;

  // フィルタリング後に現在再生中の楽曲を適切に維持する関数
  const updateCurrentTrackAfterFilter = (newFilteredTracks: any[]) => {
    if (newFilteredTracks.length === 0) {
      setCurrentTrackIdx(0);
      return;
    }

    // 現在再生中の楽曲のvideoId
    const currentVideoId = currentTrack?.videoId;
    
    if (currentVideoId) {
      // フィルタリング後の楽曲リストで同じ楽曲を探す
      const foundIndex = newFilteredTracks.findIndex(track => track.videoId === currentVideoId);
      
      if (foundIndex !== -1) {
        // 同じ楽曲が見つかった場合、そのインデックスに設定
        setCurrentTrackIdx(foundIndex);
      } else {
        // 見つからない場合は先頭の楽曲に切り替え
        setCurrentTrackIdx(0);
        
        // YouTubeプレイヤーも新しい楽曲を読み込み
        if (newFilteredTracks.length > 0 && playerRef.current && playerReadyRef.current) {
          const newTrack = newFilteredTracks[0];
          playerRef.current.loadVideoById({
            videoId: newTrack.videoId,
            startSeconds: newTrack.start_time,
            endSeconds: newTrack.end_time,
          });
          setIsPlaying(false); // 停止状態で切り替え
          setProgress(0);
        }
      }
    } else {
      // 現在の楽曲が存在しない場合は先頭に設定
      setCurrentTrackIdx(0);
    }
  };

  // YouTube IFrame APIの読み込み
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onload = () => {};
    tag.onerror = (error) => console.error('YouTube API script failed to load:', error);
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => {
      setYtReady(true);
    };
    
    // フォールバック: 一定時間後にYTオブジェクトをチェック
    const fallbackCheck = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(fallbackCheck);
        setYtReady(true);
      }
    }, 1000);
    
    // 10秒後にフォールバックチェックを停止
    setTimeout(() => {
      clearInterval(fallbackCheck);
    }, 10000);
    
    return () => {
      clearInterval(fallbackCheck);
      delete (window as any).onYouTubeIframeAPIReady;
    };
  }, []);

  // プレイヤー生成（1回だけ）
  useEffect(() => {
    if (!ytReady || !iframeContainerRef.current) {
      return;
    }
    if (playerRef.current) {
      return;
    }
    if (initAttempts >= maxInitAttempts) {
      return;
    }
    
    // プレイヤー生成を少し遅延させてDOMの準備を確実にする
    const initPlayer = () => {
      setInitAttempts(prev => prev + 1);
      
      try {
        playerRef.current = new window.YT.Player(iframeContainerRef.current, {
          height: '100%',
          width: '100%',
          // videoIdを指定せずに初期化（iframeのみ生成）
          playerVars: {
            controls: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            showinfo: 0,
            autoplay: 0, // 自動再生を無効化
            enablejsapi: 1, // JavaScript APIを有効化
            origin: window.location.origin, // オリジンを明示的に設定
          },
          events: {
            onReady: () => {
              setPlayerReady(true);
              console.log('YouTube player ready');
            },
            onStateChange: (event: any) => {
              // 最新のfilteredTracksとcurrentTrackIdxを取得
              const currentFilteredTracks = tracks.filter(t => {
                const matchCategory = !selectedCategory || t.category === selectedCategory;
                const matchVocalist = !selectedVocalist || (t.vocalist && t.vocalist.split(',').map((v: string) => v.trim()).includes(selectedVocalist));
                return matchCategory && matchVocalist;
              });
              
              // 最新のcurrentTrackIdxを取得
              const latestCurrentTrackIdx = currentTrackIdxRef.current;
              
              if (event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
                // 次の曲に進む処理
                setTimeout(async () => {
                  if (isRepeatRef.current) {
                    // リピート時は同じ曲を再生
                    const currentTrack = currentFilteredTracks[latestCurrentTrackIdx];
                    if (playerRef.current && playerReadyRef.current && currentTrack) {
                      try {
                        playerRef.current.loadVideoById({
                          videoId: currentTrack.videoId,
                          startSeconds: currentTrack.start_time,
                        });
                        // ユーザーインタラクションがある場合のみ自動再生
                        if (hasUserInteracted) {
                          playerRef.current.playVideo();
                          setIsPlaying(true);
                        }
                      } catch (error) {
                        console.error('Failed to load repeat video:', error);
                      }
                    }
                    setProgress(0);
                  } else if (isRandomRef.current) {
                    // ランダム時はランダムに次の曲を選択
                    const nextIdx = getRandomIndex();
                    setCurrentTrackIdx(nextIdx);
                    if (playerRef.current && playerReadyRef.current) {
                      const nextTrack = currentFilteredTracks[nextIdx];
                      try {
                        playerRef.current.loadVideoById({
                          videoId: nextTrack.videoId,
                          startSeconds: nextTrack.start_time,
                        });
                        // ユーザーインタラクションがある場合のみ自動再生
                        if (hasUserInteracted) {
                          playerRef.current.playVideo();
                          setIsPlaying(true);
                        }
                      } catch (error) {
                        console.error('Failed to load random video:', error);
                      }
                    }
                    setProgress(0);
                  } else if (latestCurrentTrackIdx < currentFilteredTracks.length - 1) {
                    // シーケンシャル時は次の曲に進む
                    const nextIdx = latestCurrentTrackIdx + 1;
                    if (playerRef.current && playerReadyRef.current) {
                      const nextTrack = currentFilteredTracks[nextIdx];
                      try {
                        // endSecondsを指定せずに動画を読み込み
                        playerRef.current.loadVideoById({
                          videoId: nextTrack.videoId,
                          startSeconds: nextTrack.start_time,
                        });
                        
                        // 動画が読み込まれた後に時間範囲を設定
                        setTimeout(() => {
                          if (playerRef.current && playerReadyRef.current) {
                            // ユーザーインタラクションがある場合のみ自動再生
                            if (hasUserInteracted) {
                              playerRef.current.playVideo();
                              setIsPlaying(true);
                            }
                            // 動画の読み込みが完了してからcurrentTrackIdxを更新
                            setCurrentTrackIdx(nextIdx);
                            
                            // 動画の終了を手動でチェック
                            const checkEndTime = setInterval(() => {
                              try {
                                if (playerRef.current && playerReadyRef.current) {
                                  const currentTime = playerRef.current.getCurrentTime();
                                  const safeEnd = nextTrack.end_time;
                                  if (currentTime >= safeEnd) {
                                    clearInterval(checkEndTime);
                                    playerRef.current.pauseVideo();
                                    setIsPlaying(false);
                                  }
                                }
                              } catch (error) {
                                clearInterval(checkEndTime);
                              }
                            }, 1000);
                          }
                        }, 1000);
                      } catch (error) {
                        console.error('Failed to load next video:', error);
                      }
                    }
                    setProgress(0);
                  } else {
                    // 最後の曲の場合は停止
                    setIsPlaying(false);
                    setProgress(0);
                  }
                }, 100);
              } else if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true);
              } else if (event.data === window.YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              }
            },
            onError: (event: any) => {
              console.log('YouTube Player Error:', event.data);
              // エラー時はプレイヤーを再初期化
              setTimeout(() => {
                if (playerRef.current && initAttempts < maxInitAttempts) {
                  playerRef.current.destroy();
                  playerRef.current = null;
                  setPlayerReady(false);
                  initPlayer();
                }
              }, 1000);
            },
          },
        });
      } catch (error) {
        console.error('Failed to initialize YouTube player:', error);
        // エラー時は再試行
        if (initAttempts < maxInitAttempts) {
          setTimeout(initPlayer, 1000);
        }
      }
    };
    
    // モバイルデバイスでは少し長めの遅延を設定
    const delay = window.innerWidth < 900 ? 500 : 100;
    setTimeout(initPlayer, delay);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady, initAttempts]);

  useEffect(() => {
    fetch('/playlist.csv')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.text();
      })
      .then(csvText => {
        if (!csvText || csvText.trim().length === 0) {
          throw new Error('CSV file is empty');
        }
        const result = Papa.parse(csvText, { header: true });
        if (!result.data || result.data.length === 0) {
          throw new Error('No data found in CSV');
        }
        const parsedTracks = result.data
          .filter((t: any) => t.youtube_video_id && t.youtube_video_id.trim() !== '')
          .map((t: any) => ({
            videoId: t.youtube_video_id,
            thumbnail: `https://img.youtube.com/vi/${t.youtube_video_id}/maxresdefault.jpg`,
            track_title: t.track_title,
            artist: t.artist,
            vocalist: t.vocalist,
            category: t.category,
            start_time: Number(t.start_time),
            end_time: Number(t.end_time),
          }));
        if (parsedTracks.length === 0) {
          throw new Error('No valid tracks found in CSV');
        }
        setTracks(parsedTracks);
      })
      .catch(error => {
        console.error('Failed to load playlist:', error);
        // エラー時は空の配列を設定してアプリが動作するようにする
        setTracks([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // プレイヤーが準備できたときに最初の動画を設定
  useEffect(() => {
    if (playerReady && tracks.length > 0 && playerRef.current) {
      const firstTrack = tracks[0];
      
      // 少し遅延させて確実にプレイヤーが準備できるようにする
      setTimeout(() => {
        if (playerRef.current && playerReady) {
          try {
            // 自動再生を防ぐため、cueVideoByIdを使用（再生せずに読み込みのみ）
            playerRef.current.cueVideoById({
              videoId: firstTrack.videoId,
              startSeconds: firstTrack.start_time,
              endSeconds: firstTrack.end_time,
            });
          } catch (error) {
            console.error('Failed to load first video:', error);
          }
        }
      }, 300);
    }
  }, [playerReady, tracks]);

  useEffect(() => {
    function updateVideoHeight() {
      if (window.innerWidth >= 900 && videoAreaRef.current) {
        const width = videoAreaRef.current.offsetWidth;
        if (width > 0) {
          const height = width * 9 / 16;
          videoAreaRef.current.style.height = `${height}px`;
          videoAreaRef.current.style.paddingTop = '0';
        } else {
          // 幅が取得できない場合はデフォルト高さを設定
          videoAreaRef.current.style.height = '400px';
          videoAreaRef.current.style.paddingTop = '0';
        }
      } else if (videoAreaRef.current) {
        videoAreaRef.current.style.height = '';
        videoAreaRef.current.style.paddingTop = '56.25%';
      }
    }
    window.addEventListener('resize', updateVideoHeight);
    updateVideoHeight();
    // 複数回実行して確実に高さを設定
    setTimeout(updateVideoHeight, 0);
    setTimeout(updateVideoHeight, 100);
    setTimeout(updateVideoHeight, 500);
    return () => window.removeEventListener('resize', updateVideoHeight);
  }, [isVideoHidden]); // isVideoHiddenを依存配列に追加

  // トラックが読み込まれた後にビデオ高さを再計算
  useEffect(() => {
    if (tracks.length > 0) {
      setTimeout(() => {
        if (videoAreaRef.current) {
          if (window.innerWidth >= 900) {
            const width = videoAreaRef.current.offsetWidth;
            if (width > 0) {
              const height = width * 9 / 16;
              videoAreaRef.current.style.height = `${height}px`;
              videoAreaRef.current.style.paddingTop = '0';
            } else {
              videoAreaRef.current.style.height = '400px';
              videoAreaRef.current.style.paddingTop = '0';
            }
          } else {
            videoAreaRef.current.style.height = '';
            videoAreaRef.current.style.paddingTop = '56.25%';
          }
        }
      }, 100);
    }
  }, [tracks, isVideoHidden]); // isVideoHiddenを依存配列に追加

  // ウィンドウサイズ変更を監視
  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth < 900;
      setIsMobile(newIsMobile);
      
      // デスクトップレイアウトに切り替わった時は動画を表示状態に戻す
      if (!newIsMobile && isVideoHidden) {
        setIsVideoHidden(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVideoHidden]);

  // トラック切り替え時や停止時にprogressリセット
  useEffect(() => {
    setProgress(0);
  }, [currentTrackIdx]);

  // currentTrackIdxの変更をcurrentTrackIdxRefに反映
  useEffect(() => {
    currentTrackIdxRef.current = currentTrackIdx;
  }, [currentTrackIdx]);

  // 選択されている楽曲をスクロール範囲内の先頭に表示
  const scrollToCurrentTrack = useCallback(() => {
    console.log('scrollToCurrentTrack called, currentTrackIdx:', currentTrackIdx, 'isUserScrolling:', isUserScrolling);
    if (!listAreaRef.current) {
      console.log('listAreaRef.current is null');
      return;
    }
    
    const selectedElement = listAreaRef.current.querySelector('.track-item.selected') as HTMLElement;
    if (selectedElement) {
      console.log('Selected element found');
      // ユーザーが手動スクロール中でない場合のみ自動スクロール
      if (!isUserScrolling) {
        console.log('Executing scroll to track:', currentTrackIdx);
        
        // モバイルレイアウトでのスクロール位置調整
        if (window.innerWidth < 900) {
          // モバイルではヘッダー分の余白を考慮してスクロール
          const headerHeight = 48;
          const elementTop = selectedElement.offsetTop;
          const containerTop = listAreaRef.current.offsetTop;
          const scrollTop = elementTop - containerTop - headerHeight;
          
          listAreaRef.current.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        } else {
          // デスクトップでは通常のスクロール
          selectedElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
          });
        }
      } else {
        console.log('Skipping scroll - user is scrolling');
      }
    } else {
      console.log('Selected element not found');
    }
  }, [currentTrackIdx, isUserScrolling]);

  // currentTrackIdxが変更された時にスクロール
  useEffect(() => {
    console.log('currentTrackIdx changed to:', currentTrackIdx);
    
    // 手動スクロール状態の場合は自動スクロールをスキップ
    if (isUserScrolling) {
      console.log('Skipping auto-scroll - user has manually scrolled');
      return;
    }
    
    // 少し遅延させてDOMの更新を待つ
    const timer = setTimeout(() => {
      console.log('Calling scrollToCurrentTrack after delay');
      scrollToCurrentTrack();
    }, 200);
    
    return () => clearTimeout(timer);
  }, [currentTrackIdx, isUserScrolling, scrollToCurrentTrack]);

  // isRepeatとisRandomの変更をrefに反映
  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    isRandomRef.current = isRandom;
  }, [isRandom]);

  // playerReadyの変更をrefに反映
  useEffect(() => {
    playerReadyRef.current = playerReady;
  }, [playerReady]);

  // 選択されたボーカリストが変更された時にテーマを更新
  useEffect(() => {
    setCurrentTheme(getCurrentTheme(selectedVocalist));
  }, [selectedVocalist]);

  // フィルタモーダル内でpendingVocalistが変更された時にテーマを更新
  useEffect(() => {
    if (showFilter) {
      setFilterModalTheme(getCurrentTheme(pendingVocalist));
    }
  }, [pendingVocalist, showFilter]);

  // テーマが変更された時にシークバーの色を更新
  useEffect(() => {
    const seekBar = document.querySelector('.custom-seek-bar') as HTMLInputElement;
    if (seekBar) {
      const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
      seekBar.style.background = `linear-gradient(to right, ${currentTheme.secondary} 0%, ${currentTheme.secondary} ${progressPercent}%, rgba(255, 255, 255, 0.3) ${progressPercent}%, rgba(255, 255, 255, 0.3) 100%)`;
    }
  }, [currentTheme, progress, duration]);

  // ランダムで次のインデックスを取得（現在の曲以外）
  const getRandomIndex = () => {
    if (filteredTracks.length <= 1) return currentTrackIdx;
    let idx;
    do {
      idx = Math.floor(Math.random() * filteredTracks.length);
    } while (idx === currentTrackIdx);
    return idx;
  };

  // ユーザーの手動スクロールを検知
  const handleUserScroll = () => {
    console.log('User scroll detected, setting isUserScrolling to true');
    setIsUserScrolling(true);
    setHasUserInteracted(true); // ユーザーインタラクションを記録
    // 手動スクロール状態は永続的に保持（自動リセットしない）
  };

  // ユーザーインタラクションを検知する関数
  const handleUserInteraction = () => {
    setHasUserInteracted(true);
  };

  // 再生区間が終わったら次の動画へ
  useEffect(() => {
    if (!currentTrack || !isPlaying) return;
    
    // シークバー用インターバルのみ実行
    progressIntervalRef.current = setInterval(() => {
      if (playerRef.current && filteredTracks[currentTrackIdx] && !isSeeking) {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          const currentTrack = filteredTracks[currentTrackIdx];
          const videoStartTime = currentTrack.start_time;
          const relativeTime = Math.max(0, currentTime - videoStartTime);
          const trackDuration = currentTrack.end_time - currentTrack.start_time;
          
          // 相対時間がトラックの範囲内の場合のみ更新
          if (relativeTime >= 0 && relativeTime <= trackDuration) {
            setProgress(relativeTime);
          }
        } catch (error) {
          // エラーは無視
        }
      }
    }, 200);
    
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIdx, filteredTracks, isPlaying, progress, isRandom, isRepeat, playerReady]);

  // duration補正用の関数
  const getSafeEndTime = async (track: any) => {
    if (playerRef.current && playerReadyRef.current) {
      let duration = 0;
      try {
        duration = await playerRef.current.getDuration();
      } catch (e) {
        // エラーは無視
      }
      if (typeof duration === 'number' && duration > 0) {
        return Math.min(track.end_time, duration);
      }
    }
    return track.end_time;
  };

  // 再生・一時停止
  const handlePlay = () => {
    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };
  const handlePause = () => {
    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    }
  };
  // 次・前
  const handleNext = async () => {
    // 次/前ボタンクリック時は手動スクロール状態をリセット
    setIsUserScrolling(false);
    setHasUserInteracted(true); // ユーザーインタラクションを記録
    
    if (isRandom) {
      const nextIdx = getRandomIndex();
      setCurrentTrackIdx(nextIdx);
      if (playerRef.current && playerReadyRef.current) {
        const nextTrack = filteredTracks[nextIdx];
        const safeEnd = await getSafeEndTime(nextTrack);
        playerRef.current.loadVideoById({
          videoId: nextTrack.videoId,
          startSeconds: nextTrack.start_time,
          endSeconds: safeEnd,
        });
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
      setProgress(0);
    } else if (currentTrackIdxRef.current < filteredTracks.length - 1) {
      const nextIdx = currentTrackIdxRef.current + 1;
      setCurrentTrackIdx(nextIdx);
      if (playerRef.current && playerReadyRef.current) {
        const nextTrack = filteredTracks[nextIdx];
        const safeEnd = await getSafeEndTime(nextTrack);
        playerRef.current.loadVideoById({
          videoId: nextTrack.videoId,
          startSeconds: nextTrack.start_time,
          endSeconds: safeEnd,
        });
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
      setProgress(0);
    }
  };
  const handlePrev = async () => {
    // 次/前ボタンクリック時は手動スクロール状態をリセット
    setIsUserScrolling(false);
    setHasUserInteracted(true); // ユーザーインタラクションを記録
    
    if (isRandom) {
      const prevIdx = getRandomIndex();
      setCurrentTrackIdx(prevIdx);
      if (playerRef.current && playerReadyRef.current) {
        const prevTrack = filteredTracks[prevIdx];
        const safeEnd = await getSafeEndTime(prevTrack);
        playerRef.current.loadVideoById({
          videoId: prevTrack.videoId,
          startSeconds: prevTrack.start_time,
          endSeconds: safeEnd,
        });
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
      setProgress(0);
    } else if (currentTrackIdxRef.current > 0) {
      const prevIdx = currentTrackIdxRef.current - 1;
      setCurrentTrackIdx(prevIdx);
      if (playerRef.current && playerReadyRef.current) {
        const prevTrack = filteredTracks[prevIdx];
        const safeEnd = await getSafeEndTime(prevTrack);
        playerRef.current.loadVideoById({
          videoId: prevTrack.videoId,
          startSeconds: prevTrack.start_time,
          endSeconds: safeEnd,
        });
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
      setProgress(0);
    }
  };

  // シークバー操作
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSeeking(true); // シーク開始
    const newProgress = Number(e.target.value);
    setProgress(newProgress);
    
    // シークバーが最後まで到達した場合の処理
    if (currentTrack) {
      const duration = currentTrack.end_time - currentTrack.start_time;
      if (newProgress >= duration) {
        // 少し遅延させてから次の曲に進む
        setTimeout(async () => {
          if (isRepeat) {
            setIsPlaying(false);
            setTimeout(async () => {
              setProgress(0);
              // リピート時はloadVideoByIdで再生
              if (playerRef.current && playerReadyRef.current && currentTrack) {
                const safeEnd = await getSafeEndTime(currentTrack);
                playerRef.current.loadVideoById({
                  videoId: currentTrack.videoId,
                  startSeconds: currentTrack.start_time,
                  endSeconds: safeEnd,
                });
                playerRef.current.playVideo();
                setIsPlaying(true);
              }
            }, 100);
          } else if (isRandom) {
            const nextIdx = getRandomIndex();
            setCurrentTrackIdx(nextIdx);
            if (playerRef.current && playerReadyRef.current) {
              const nextTrack = filteredTracks[nextIdx];
              const safeEnd = await getSafeEndTime(nextTrack);
              playerRef.current.loadVideoById({
                videoId: nextTrack.videoId,
                startSeconds: nextTrack.start_time,
                endSeconds: safeEnd,
              });
              playerRef.current.playVideo();
              setIsPlaying(true);
            }
            setProgress(0);
          } else if (currentTrackIdx < filteredTracks.length - 1) {
            const nextIdx = currentTrackIdx + 1;
            setCurrentTrackIdx(nextIdx);
            if (playerRef.current && playerReadyRef.current) {
              const nextTrack = filteredTracks[nextIdx];
              const safeEnd = await getSafeEndTime(nextTrack);
              playerRef.current.loadVideoById({
                videoId: nextTrack.videoId,
                startSeconds: nextTrack.start_time,
                endSeconds: safeEnd,
              });
              playerRef.current.playVideo();
              setIsPlaying(true);
            }
            setProgress(0);
          } else {
            setIsPlaying(false); // 最後の動画で止める
            setProgress(0);
          }
        }, 100);
      }
    }
  };
  // シーク確定時（マウス離し/タッチ離し）
  const handleSeekCommit = async () => {
    if (playerRef.current && playerReadyRef.current && currentTrack) {
      const seekTo = currentTrack.start_time + progress;
      const safeEnd = await getSafeEndTime(currentTrack);
      playerRef.current.loadVideoById({
        videoId: currentTrack.videoId,
        startSeconds: seekTo,
        endSeconds: safeEnd,
      });
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
    
    // シーク完了後、少し遅延させてからシークフラグを解除
    setTimeout(() => {
      setIsSeeking(false);
    }, 500);
    
    // タイマー再設定
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    const duration = currentTrack.end_time - currentTrack.start_time;
    const remain = (duration - progress) * 1000;
    timeoutRef.current = setTimeout(async () => {
      if (isRepeat) {
        setIsPlaying(false);
        setTimeout(async () => {
          setProgress(0);
          // リピート時はloadVideoByIdで再生
          if (playerRef.current && playerReadyRef.current && currentTrack) {
            const safeEnd = await getSafeEndTime(currentTrack);
            playerRef.current.loadVideoById({
              videoId: currentTrack.videoId,
              startSeconds: currentTrack.start_time,
              endSeconds: safeEnd,
            });
            playerRef.current.playVideo();
            setIsPlaying(true);
          }
        }, 100);
      } else if (isRandom) {
        const nextIdx = getRandomIndex();
        setCurrentTrackIdx(nextIdx);
        if (playerRef.current && playerReadyRef.current) {
          const nextTrack = filteredTracks[nextIdx];
          const safeEnd = await getSafeEndTime(nextTrack);
          playerRef.current.loadVideoById({
            videoId: nextTrack.videoId,
            startSeconds: nextTrack.start_time,
            endSeconds: safeEnd,
          });
          playerRef.current.playVideo();
          setIsPlaying(true);
        }
        setProgress(0);
      } else if (currentTrackIdx < filteredTracks.length - 1) {
        const nextIdx = currentTrackIdx + 1;
        setCurrentTrackIdx(nextIdx);
        if (playerRef.current && playerReadyRef.current) {
          const nextTrack = filteredTracks[nextIdx];
          const safeEnd = await getSafeEndTime(nextTrack);
          playerRef.current.loadVideoById({
            videoId: nextTrack.videoId,
            startSeconds: nextTrack.start_time,
            endSeconds: safeEnd,
          });
          playerRef.current.playVideo();
          setIsPlaying(true);
        }
        setProgress(0);
      } else {
        setIsPlaying(false); // 最後の動画で止める
        setProgress(0);
      }
    }, remain);
    // シークバー用インターバル
    progressIntervalRef.current = setInterval(() => {
      if (playerRef.current && filteredTracks[currentTrackIdx] && !isSeeking) {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          const currentTrack = filteredTracks[currentTrackIdx];
          const videoStartTime = currentTrack.start_time;
          const relativeTime = Math.max(0, currentTime - videoStartTime);
          const trackDuration = currentTrack.end_time - currentTrack.start_time;
          
          // 相対時間がトラックの範囲内の場合のみ更新
          if (relativeTime >= 0 && relativeTime <= trackDuration) {
            setProgress(relativeTime);
          }
        } catch (error) {
          console.log('Failed to sync progress:', error);
        }
      }
    }, 200);
  };

  // リストクリック
  const handleTrackClick = async (idx: number) => {
    // トラッククリック時は手動スクロール状態をリセット
    setIsUserScrolling(false);
    setHasUserInteracted(true); // ユーザーインタラクションを記録
    
    setCurrentTrackIdx(idx);
    if (playerRef.current && playerReadyRef.current) {
      const track = filteredTracks[idx];
      const safeEnd = await getSafeEndTime(track);
      playerRef.current.loadVideoById({
        videoId: track.videoId,
        startSeconds: track.start_time,
        endSeconds: safeEnd,
      });
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
    setProgress(0);
  };

  return (
    <div className="App" style={{ fontFamily: 'sans-serif', background: '#f9f9f9', height: '100vh', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ヘッダー */}
      <header style={{ background: currentTheme.primary, color: currentTheme.textColor }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', marginRight: '16px' }}>
          {currentTheme.logo.startsWith('/') ? (
            <img 
              src={currentTheme.logo} 
              alt="Speciale Music" 
              style={{ 
                height: '32px', 
                width: 'auto',
                maxWidth: '200px'
              }} 
            />
          ) : (
            <div 
              style={{ 
                fontSize: '24px',
                lineHeight: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {currentTheme.logo}
            </div>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {/* お知らせボタン */}
          <button
            onClick={() => setShowAnnouncement(true)}
            style={{
              ...iconBtnStyle,
              width: 40,
              height: 40,
              margin: '0 4px',
              color: currentTheme.textColor,
              background: 'none',
              borderRadius: '4px',
              transition: 'background 0.2s',
            }}
            aria-label="お知らせ"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </button>
          {/* 動画非表示ボタン（1カラムレイアウト時のみ表示） */}
          {isMobile && (
            <button
              onClick={() => {
                setIsVideoHidden(h => !h);
              }}
              style={{
                ...iconBtnStyle,
                width: 40,
                height: 40,
                margin: '0 4px',
                color: currentTheme.textColor,
                background: isVideoHidden ? 'rgba(97, 218, 251, 0.15)' : 'none',
                borderRadius: '4px',
                transition: 'background 0.2s',
              }}
              aria-label={isVideoHidden ? "動画を表示" : "動画を非表示"}
            >
              {isVideoHidden ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
            </button>
          )}
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
              color: currentTheme.textColor,
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
                    <span className="custom-radio-custom" style={{ 
                      borderColor: filterModalTheme.primary,
                      ...(pendingCategory === '' && { 
                        borderColor: filterModalTheme.primary, 
                        background: filterModalTheme.primary 
                      })
                    }} />
                    {pendingCategory === '' && (
                      <span style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: filterModalTheme.textColor,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }} />
                    )}
                    すべて
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="utamita" checked={pendingCategory === 'utamita'} onChange={() => setPendingCategory('utamita')} />
                    <span className="custom-radio-custom" style={{ 
                      borderColor: filterModalTheme.primary,
                      ...(pendingCategory === 'utamita' && { 
                        borderColor: filterModalTheme.primary, 
                        background: filterModalTheme.primary 
                      })
                    }} />
                    {pendingCategory === 'utamita' && (
                      <span style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: filterModalTheme.textColor,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }} />
                    )}
                    歌ってみた
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="utawaku" checked={pendingCategory === 'utawaku'} onChange={() => setPendingCategory('utawaku')} />
                    <span className="custom-radio-custom" style={{ 
                      borderColor: filterModalTheme.primary,
                      ...(pendingCategory === 'utawaku' && { 
                        borderColor: filterModalTheme.primary, 
                        background: filterModalTheme.primary 
                      })
                    }} />
                    {pendingCategory === 'utawaku' && (
                      <span style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: filterModalTheme.textColor,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }} />
                    )}
                    歌枠
                  </label>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="category" value="original" checked={pendingCategory === 'original'} onChange={() => setPendingCategory('original')} />
                    <span className="custom-radio-custom" style={{ 
                      borderColor: filterModalTheme.primary,
                      ...(pendingCategory === 'original' && { 
                        borderColor: filterModalTheme.primary, 
                        background: filterModalTheme.primary 
                      })
                    }} />
                    {pendingCategory === 'original' && (
                      <span style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: filterModalTheme.textColor,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }} />
                    )}
                    オリジナル
                  </label>
                </div>
                {/* メンバーフィルタ */}
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>メンバー</div>
                <div className="custom-radio-group" style={{ marginBottom: 8 }}>
                  <label className="custom-radio-label">
                    <input className="custom-radio-input" type="radio" name="vocalist" value="" checked={pendingVocalist === ''} onChange={() => setPendingVocalist('')} />
                    <span className="custom-radio-custom" style={{ 
                      borderColor: filterModalTheme.primary,
                      ...(pendingVocalist === '' && { 
                        borderColor: filterModalTheme.primary, 
                        background: filterModalTheme.primary 
                      })
                    }} />
                    {pendingVocalist === '' && (
                      <span style={{
                        position: 'absolute',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: filterModalTheme.textColor,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }} />
                    )}
                    すべて
                  </label>
                  {vocalistList.map(v => (
                    <label key={v} className="custom-radio-label">
                      <input className="custom-radio-input" type="radio" name="vocalist" value={v} checked={pendingVocalist === v} onChange={() => setPendingVocalist(v)} />
                      <span className="custom-radio-custom" style={{ 
                        borderColor: filterModalTheme.primary,
                        ...(pendingVocalist === v && { 
                          borderColor: filterModalTheme.primary, 
                          background: filterModalTheme.primary 
                        })
                      }} />
                      {pendingVocalist === v && (
                        <span style={{
                          position: 'absolute',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: filterModalTheme.textColor,
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none'
                        }} />
                      )}
                      {v}
                    </label>
                  ))}
                </div>
                {/* 決定ボタン */}
                <button
                  style={{ 
                    width: '100%', 
                    padding: '8px', 
                    background: previewTracks.length === 0 ? '#ccc' : filterModalTheme.primary, 
                    color: previewTracks.length === 0 ? '#666' : filterModalTheme.textColor, 
                    border: 'none', 
                    borderRadius: 4, 
                    fontWeight: 'bold', 
                    cursor: previewTracks.length === 0 ? 'not-allowed' : 'pointer', 
                    marginTop: 8 
                  }}
                  disabled={previewTracks.length === 0}
                  onClick={() => {
                    setSelectedCategory(pendingCategory);
                    setSelectedVocalist(pendingVocalist);
                    setShowFilter(false);
                    // フィルタリング後に現在再生中の楽曲を適切に維持
                    updateCurrentTrackAfterFilter(previewTracks);
                  }}
                >
                  {previewTracks.length}曲を表示
                </button>
              </div>
            </div>
          )}
          {/* お知らせモーダル */}
          {showAnnouncement && (
            <div className="filter-modal-overlay" onClick={() => setShowAnnouncement(false)}>
              <div className="filter-modal-content" style={{ 
                height: '80vh',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                minWidth: '260px',
                maxWidth: '90vw',
                padding: '0'
              }} onClick={e => e.stopPropagation()}>
                {/* タイトル部分 */}
                <div style={{ 
                  padding: '24px 20px 12px 20px',
                  borderBottom: '1px solid #eee',
                  flexShrink: 0
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', textAlign: 'center' }}>
                    このサイトについて
                  </div>
                </div>
                
                {/* スクロール可能なテキストエリア */}
                <div style={{ 
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  lineHeight: '1.4',
                  fontSize: '0.85rem'
                }}>
                  {announcements.map((item, index) => (
                    <div key={index} style={{ marginBottom: '10px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        {item.emoji} {item.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666', whiteSpace: 'pre-line' }}>
                        {item.content}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* 固定配置の閉じるボタン */}
                <div style={{
                  padding: '12px 20px 20px 20px',
                  background: '#fff',
                  borderTop: '1px solid #eee',
                  flexShrink: 0,
                  borderBottomLeftRadius: '12px',
                  borderBottomRightRadius: '12px'
                }}>
                  <button
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      background: currentTheme.primary, 
                      color: currentTheme.textColor, 
                      border: 'none', 
                      borderRadius: 4, 
                      fontWeight: 'bold', 
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                    onClick={() => setShowAnnouncement(false)}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* currentTrackが存在しない場合のローディング画面 */}
      {!currentTrack ? (
        <div className="main-content" style={{flex: 1, minHeight: 0}}>
          <div 
            className="video-area" 
            ref={videoAreaRef}
            style={{ 
              display: 'block'
            }}
          >
            <div 
              ref={iframeContainerRef} 
              style={{ 
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%', 
                height: '100%',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div>Loading...</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                {!ytReady && 'YouTube APIを読み込み中...'}
                {ytReady && !playerReady && 'プレイヤーを初期化中...'}
                {playerReady && tracks.length === 0 && 'プレイリストを読み込み中...'}
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '8px' }}>
                <div>ytReady: {ytReady ? '✓' : '✗'}</div>
                <div>playerReady: {playerReady ? '✓' : '✗'}</div>
                <div>tracks: {tracks.length}</div>
                <div>initAttempts: {initAttempts}/{maxInitAttempts}</div>
              </div>
              {initAttempts >= maxInitAttempts && (
                <button 
                  onClick={() => window.location.reload()} 
                  style={{
                    padding: '8px 16px',
                    background: '#61dafb',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  再読み込み
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Youtube動画 */}
          <div className="main-content" style={{flex: 1, minHeight: 0}}>
            <div 
              className="video-area" 
              ref={videoAreaRef}
              style={{ 
                display: isVideoHidden ? 'none' : 'block'
              }}
            >
              <div 
                ref={iframeContainerRef} 
                style={{ 
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '100%', 
                  height: '100%',
                  background: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}
              >
                {!playerReady && <div>Loading YouTube Player...</div>}
              </div>
            </div>
            <div 
              className={`list-area${isVideoHidden ? ' video-hidden' : ''}`}
              ref={listAreaRef}
              onScroll={handleUserScroll}
              onWheel={handleUserScroll}
              onTouchMove={handleUserScroll}
              onClick={handleUserInteraction}
              onTouchStart={handleUserInteraction}
            >
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
          <footer style={{ background: currentTheme.primary }}>
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
                  color: currentTheme.textColor,
                  background: isRandom ? 'rgba(255, 255, 255, 0.2)' : 'none',
                  border: 'none',
                  margin: 0,
                  padding: 0,
                  opacity: 1,
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
                  color: currentTheme.textColor,
                  background: isRepeat ? 'rgba(255, 255, 255, 0.2)' : 'none',
                  border: 'none',
                  margin: 0,
                  padding: 0,
                  opacity: 1,
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
              style={{ 
                width: '100%', 
                margin: '12px 0 12px 0', 
                height: 4,
                WebkitAppearance: 'none',
                appearance: 'none',
                background: 'transparent',
                cursor: 'pointer'
              }}
              className="custom-seek-bar"
            />
            {/* 楽曲情報と操作ボタン（縦並び） */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              {/* 再生中のサムネ・情報 */}
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, marginBottom: 4, width: '100%', justifyContent: 'center' }}>
                <img src={currentTrack.thumbnail} alt={currentTrack.track_title} style={{ width: 40, height: 24, objectFit: 'cover', borderRadius: '4px', marginRight: 8 }} />
                <div style={{ color: currentTheme.textColor, fontSize: '0.95rem', minWidth: 0, overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{currentTrack.track_title}</div>
                  {/* <div style={{ fontSize: '0.85rem', color: '#bbb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{currentTrack.artist}</div> */}
                </div>
              </div>
              {/* 操作ボタン（縦並び） */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button onClick={handlePrev} disabled={isRepeat || currentTrackIdx === 0} style={{
                  ...iconBtnStyle,
                  opacity: isRepeat || currentTrackIdx === 0 ? 0.4 : 1,
                  color: currentTheme.textColor,
                }} aria-label="前">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                </button>
                {isPlaying ? (
                  <button onClick={handlePause} style={{...iconBtnStyle, color: currentTheme.textColor}} aria-label="一時停止">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  </button>
                ) : (
                  <button onClick={handlePlay} style={{...iconBtnStyle, color: currentTheme.textColor}} aria-label="再生">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                )}
                <button onClick={handleNext} disabled={isRepeat || currentTrackIdx === filteredTracks.length - 1} style={{
                  ...iconBtnStyle,
                  opacity: isRepeat || currentTrackIdx === filteredTracks.length - 1 ? 0.4 : 1,
                  color: currentTheme.textColor,
                }} aria-label="次">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                </button>
              </div>
            </div>
          </footer>
        </>
      )}
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
