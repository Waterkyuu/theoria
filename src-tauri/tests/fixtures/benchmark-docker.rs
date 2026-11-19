use std::io::Write;

fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().is_some_and(|argument| argument == "wait") {
        std::fs::write(&arguments[1], "ready").expect("ready marker");
        std::thread::sleep(std::time::Duration::from_secs(60));
        return;
    }
    let executable = std::env::current_exe().expect("fixture executable");
    let name = executable
        .file_name()
        .expect("fixture name")
        .to_string_lossy();
    if name == format!("uv{}", std::env::consts::EXE_SUFFIX) {
        let bin =
            std::path::PathBuf::from(std::env::var_os("UV_TOOL_BIN_DIR").expect("private bin"));
        std::fs::create_dir_all(&bin).expect("private install directory");
        std::fs::copy(
            &executable,
            bin.join(format!("harbor{}", std::env::consts::EXE_SUFFIX)),
        )
        .expect("private runner");
        std::fs::write(
            executable.with_extension("audit"),
            format!(
                "{}\n{}",
                arguments.join("\n"),
                std::env::var("UV_TOOL_DIR").expect("private tool dir")
            ),
        )
        .expect("install audit");
        return;
    }
    if name.starts_with("environment-") || name == format!("harbor{}", std::env::consts::EXE_SUFFIX)
    {
        let state = std::fs::read_to_string(executable.with_extension("state")).unwrap_or_default();
        if name.starts_with("environment-harbor")
            || name == format!("harbor{}", std::env::consts::EXE_SUFFIX)
        {
            println!(
                "harbor {}",
                if state == "wrong_version" {
                    "0.1.0"
                } else {
                    "0.26.0"
                }
            );
        } else if arguments.first().is_some_and(|arg| arg == "info") {
            if state == "stopped" {
                std::process::exit(1);
            }
            println!(
                "{}",
                if state == "windows" {
                    "windows"
                } else {
                    "linux"
                }
            );
        } else if arguments.first().is_some_and(|arg| arg == "image") && state == "missing_image" {
            std::process::exit(1);
        }
        return;
    }
    let audit = std::env::current_exe()
        .expect("fixture executable")
        .with_extension("audit");
    let mut output = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(audit)
        .expect("fixture audit");
    writeln!(output, "{}", arguments.join("\n")).expect("audit command");
    if arguments
        .iter()
        .any(|argument| argument.contains("invalid.py"))
    {
        std::process::exit(2);
    }
    if arguments
        .iter()
        .any(|argument| argument.contains("runpy.run_path"))
    {
        println!(
            r#"{{"passed":true,"checks":[{{"passed":true,"message":"engine_report","path":null}}]}}"#
        );
    }
}
