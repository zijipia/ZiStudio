pub type Id = u64;

#[derive(Clone, Debug, PartialEq)]
pub struct Keyframe<T> {
    pub time: f64,
    pub value: T,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Property<T> {
    Static(T),
    Animated(Vec<Keyframe<T>>),
}

impl<T: Clone> Property<T> {
    pub fn value_at(&self, time: f64) -> Option<T> {
        match self {
            Self::Static(value) => Some(value.clone()),
            Self::Animated(keys) => {
                let first = keys.first()?;
                if time <= first.time { return Some(first.value.clone()); }
                let last = keys.last()?;
                if time >= last.time { return Some(last.value.clone()); }
                keys.windows(2)
                    .find(|pair| time >= pair[0].time && time <= pair[1].time)
                    .map(|pair| pair[0].value.clone())
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Transform {
    pub position: Property<[f32; 3]>,
    pub scale: Property<[f32; 3]>,
    pub rotation: Property<[f32; 3]>,
    pub opacity: Property<f32>,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            position: Property::Static([0.0, 0.0, 0.0]),
            scale: Property::Static([1.0, 1.0, 1.0]),
            rotation: Property::Static([0.0, 0.0, 0.0]),
            opacity: Property::Static(1.0),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum LayerKind {
    Video,
    Image,
    Text,
    Solid,
    Adjustment,
    Composition,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Layer {
    pub id: Id,
    pub name: String,
    pub kind: LayerKind,
    pub transform: Transform,
    pub start: f64,
    pub duration: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Composition {
    pub id: Id,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub layers: Vec<Layer>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Project {
    pub version: u32,
    pub name: String,
    pub compositions: Vec<Composition>,
}

impl Default for Project {
    fn default() -> Self {
        Self { version: 1, name: "Untitled Project".into(), compositions: Vec::new() }
    }
}
