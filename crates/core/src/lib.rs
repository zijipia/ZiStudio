use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Composition {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub compositions: Vec<Composition>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            version: 1,
            id: "project-1".into(),
            name: "Untitled Project".into(),
            compositions: vec![Composition {
                id: "composition-1".into(),
                name: "Main Composition".into(),
                width: 1920,
                height: 1080,
                fps: 60.0,
                duration: 10.0,
            }],
        }
    }
}

pub fn project_schema_version() -> u32 {
    1
}
