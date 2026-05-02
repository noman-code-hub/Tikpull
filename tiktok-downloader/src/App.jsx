import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [videoData, setVideoData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Validate TikTok URL format
  const isValidTikTokUrl = (urlString) => {
    try {
      const urlObj = new URL(urlString)
      return (
        urlObj.hostname.includes('tiktok.com') ||
        urlObj.hostname.includes('vt.tiktok.com') ||
        urlObj.hostname.includes('vm.tiktok.com')
      )
    } catch {
      return false
    }
  }

  // Fetch video metadata from TikTok oEmbed API
  const fetchVideoData = async (e) => {
    e.preventDefault()

    // Clear previous state
    setError('')
    setVideoData(null)
    setCopied(false)

    // Validate input
    if (!url.trim()) {
      setError('Please enter a TikTok URL')
      return
    }

    if (!isValidTikTokUrl(url)) {
      setError('Invalid TikTok URL. Please enter a valid TikTok video link.')
      return
    }

    setLoading(true)

    try {
      // Use TikTok's oEmbed API (public, no auth required)
      const encodedUrl = encodeURIComponent(url)
      const response = await fetch(
        `https://www.tiktok.com/oembed?url=${encodedUrl}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          setError('Video not found. Please check the URL and try again.')
        } else {
          setError('Failed to fetch video. Please try again.')
        }
        return
      }

      const data = await response.json()
      setVideoData(data)
    } catch (err) {
      setError('Error fetching video. Please check the URL and try again.')
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Copy embed code to clipboard
  const copyEmbedCode = async () => {
    if (videoData?.html) {
      try {
        await navigator.clipboard.writeText(videoData.html)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        setError('Failed to copy. Please try again.')
      }
    }
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="logo">
            <img src="/new-favicon.svg" alt="TikPull logo" className="logo-icon" />
            TikPull
          </h1>
          <p className="tagline">Download TikTok videos without watermark</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="container">
          {/* Input Section */}
          <section className="input-section">
            <h2>Paste a TikTok URL</h2>
            <form onSubmit={fetchVideoData} className="input-form">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="https://www.tiktok.com/@username/video/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="url-input"
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="fetch-button"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      Fetching...
                    </>
                  ) : (
                    'Fetch Video'
                  )}
                </button>
              </div>
            </form>

            {/* Error Message */}
            {error && (
              <div className="error-message" role="alert">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}
          </section>

          {/* Video Display Section */}
          {videoData && (
            <section className="video-section">
              <div className="video-card">
                {/* Thumbnail */}
                {videoData.thumbnail_url && (
                  <div className="thumbnail-container">
                    <img
                      src={videoData.thumbnail_url}
                      alt={videoData.title || 'Video thumbnail'}
                      className="thumbnail"
                    />
                    <div className="play-overlay">▶</div>
                  </div>
                )}

                {/* Video Info */}
                <div className="video-info">
                  {videoData.title && (
                    <h3 className="video-title">{videoData.title}</h3>
                  )}

                  {videoData.author_name && (
                    <p className="video-author">
                      <span className="author-label">By</span>
                      <strong>@{videoData.author_name}</strong>
                    </p>
                  )}

                  {videoData.video_length && (
                    <p className="video-meta">
                      Duration: <strong>{videoData.video_length}s</strong>
                    </p>
                  )}
                </div>

                {/* Embed Code Section */}
                {videoData.html && (
                  <div className="embed-section">
                    <h4>Embed Code</h4>
                    <div className="embed-code-container">
                      <pre className="embed-code">
                        <code>{videoData.html}</code>
                      </pre>
                      <button
                        onClick={copyEmbedCode}
                        className={`copy-button ${copied ? 'copied' : ''}`}
                        title="Copy to clipboard"
                      >
                        {copied ? '✓ Copied!' : '📋 Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Embedded Player */}
                {videoData.html && (
                  <div className="player-section">
                    <h4>Preview</h4>
                    <div
                      className="embed-player"
                      dangerouslySetInnerHTML={{ __html: videoData.html }}
                    />
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <button
                onClick={() => {
                  setUrl('')
                  setVideoData(null)
                  setError('')
                }}
                className="reset-button"
              >
                Search Another Video
              </button>
            </section>
          )}

          {/* Empty State */}
          {!videoData && !loading && !error && (
            <section className="empty-state">
              <div className="empty-icon">🔍</div>
              <h3>No video loaded yet</h3>
              <p>Paste a TikTok URL above to get started</p>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>
          This tool uses TikTok's public oEmbed API.
          <br />
          <span className="footer-note">Always respect creators' rights and platform terms.</span>
        </p>
      </footer>
    </div>
  )
}

export default App
