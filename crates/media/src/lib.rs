use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaKind {
    Video,
    Audio,
    Image,
}

#[derive(Debug, Clone, Default)]
pub struct MediaMetadata {
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
}

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("media source is not loaded")]
    NotLoaded,
    #[error("media source has been disposed")]
    Disposed,
    #[error("unsupported media operation: {0}")]
    Unsupported(&'static str),
    #[error("media backend error: {0}")]
    Backend(String),
}

pub type MediaResult<T> = Result<T, MediaError>;

pub trait MediaFrame: Send + Sync + fmt::Debug {
    fn timestamp(&self) -> f64;
    fn width(&self) -> u32;
    fn height(&self) -> u32;
}

pub trait MediaSource: Send {
    fn kind(&self) -> MediaKind;
    fn metadata(&self) -> Option<&MediaMetadata>;
    fn load(&mut self) -> MediaResult<MediaMetadata>;
    fn seek(&mut self, time: f64) -> MediaResult<()>;
    fn frame(&mut self, time: f64) -> MediaResult<Option<Box<dyn MediaFrame>>>;
}

pub trait MediaBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn supports_hardware_decode(&self) -> bool;
    fn open(&self, url: &str, kind: MediaKind) -> MediaResult<Box<dyn MediaSource>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_kind_is_explicit() {
        assert_eq!(MediaKind::Video, MediaKind::Video);
        assert_ne!(MediaKind::Video, MediaKind::Audio);
    }
}
