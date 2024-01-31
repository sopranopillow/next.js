use anyhow::Result;
use next_core::{
    all_assets_from_entries, next_manifests::NextFontManifest, util::get_asset_prefix_from_pathname,
};
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::{File, FileSystemPath},
    turbopack::core::{
        asset::AssetContent,
        output::{OutputAsset, OutputAssets},
        virtual_output::VirtualOutputAsset,
    },
};

use crate::middleware::get_font_paths_from_root;

pub(crate) async fn create_font_manifest(
    client_root: Vc<FileSystemPath>,
    node_root: Vc<FileSystemPath>,
    ty: &'static str,
    pathname: &str,
    original_name: &str,
    client_assets: Vc<OutputAssets>,
    app_dir: bool,
) -> Result<Vc<Box<dyn OutputAsset>>> {
    let client_root_value = client_root.await?;

    let all_client_output_assets = all_assets_from_entries(client_assets).await?;

    let font_paths =
        get_font_paths_from_root(&client_root_value, &all_client_output_assets).await?;

    let manifest_path_prefix = get_asset_prefix_from_pathname(pathname);

    let path = if app_dir {
        node_root.join(format!(
            "server/app{manifest_path_prefix}/{ty}/next-font-manifest.json",
        ))
    } else {
        node_root.join(format!(
            "server/pages{manifest_path_prefix}/next-font-manifest.json"
        ))
    };

    let map = [(original_name.to_string(), font_paths)]
        .into_iter()
        .collect();

    let next_font_manifest = if app_dir {
        NextFontManifest {
            app: map,
            // TODO
            app_using_size_adjust: false,
            ..Default::default()
        }
    } else {
        NextFontManifest {
            pages: map,
            // TODO
            pages_using_size_adjust: false,
            ..Default::default()
        }
    };

    Ok(Vc::upcast(VirtualOutputAsset::new(
        path,
        AssetContent::file(File::from(serde_json::to_string_pretty(&next_font_manifest)?).into()),
    )))
}
