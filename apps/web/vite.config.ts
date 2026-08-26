import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    /**
     * Ikut dibundel ke server build, tidak dibiarkan eksternal.
     *
     * Entry root `@phosphor-icons/react` me-re-export tiap ikon satu per satu
     * (`export * from './csr/Acorn'` dan seterusnya, ribuan baris). Bundler
     * meratakan dan menggoyang-hilangkan itu, tapi build server membiarkan
     * `node_modules` eksternal — sehingga Node memuat barrel-nya sungguhan dan
     * mengevaluasi ribuan modul terpisah.
     *
     * Ongkosnya terukur: `import('@phosphor-icons/react')` sendirian makan
     * 11.081 ms, dari total 11.506 ms yang dibutuhkan untuk meng-import seluruh
     * bundle server. Itu yang membuat satu-satunya permintaan prerender di mode
     * SPA menembus batas 10 detik bawaan React Router — batas yang tidak
     * diekspos di `react-router.config.ts`, jadi ia tidak bisa dinaikkan.
     *
     * Peramban tidak pernah kena ini: build klien memang sudah membundel dan
     * menggoyang-hilangkan ikon yang tidak dipakai.
     */
    noExternal: ["@phosphor-icons/react"],
  },
});
