param(
  # Archivo del logotipo oficial de CFE (JPEG o PNG sobre fondo claro)
  [string]$origen,
  [string]$carpeta
)

# Convierte el logotipo oficial de CFE (fondo claro) en PNG con fondo
# transparente: version a color, version blanca para fondos oscuros y la marca
# "CFE" sola, para los lugares donde no hay altura suficiente para la razon social.
#
# Sin argumentos toma recursos\logo-oficial-cfe.jpeg:
#   powershell -File scripts\generar-logos.ps1
if (-not $origen)  { $origen  = (Resolve-Path (Join-Path $PSScriptRoot "..\recursos\logo-oficial-cfe.jpeg")).Path }
if (-not $carpeta) { $carpeta = (Resolve-Path (Join-Path $PSScriptRoot "..\public\img")).Path }

Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LogoCFE
{
    // Devuelve el mapa de opacidad y el color puro de cada pixel, tomando como
    // fondo el color de las esquinas del original.
    public static string Convertir(string origen, string carpeta)
    {
        Bitmap jpeg = new Bitmap(origen);
        int an = jpeg.Width, al = jpeg.Height;

        Bitmap plano = new Bitmap(an, al, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(plano)) g.DrawImage(jpeg, 0, 0, an, al);
        jpeg.Dispose();

        Rectangle marco = new Rectangle(0, 0, an, al);
        BitmapData datos = plano.LockBits(marco, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] px = new byte[datos.Stride * al];
        Marshal.Copy(datos.Scan0, px, 0, px.Length);
        int paso = datos.Stride;
        plano.UnlockBits(datos);

        // Color de fondo: promedio de las cuatro esquinas
        int[][] esquinas = new int[][] {
            new int[]{2,2}, new int[]{an-3,2}, new int[]{2,al-3}, new int[]{an-3,al-3}
        };
        double fb = 0, fg = 0, fr = 0;
        foreach (int[] e in esquinas) {
            int i = e[1] * paso + e[0] * 4;
            fb += px[i]; fg += px[i+1]; fr += px[i+2];
        }
        fb /= 4; fg /= 4; fr /= 4;

        // Distancia maxima al fondo (el verde puro del logotipo)
        double maxDist = 1;
        for (int y = 0; y < al; y++)
            for (int x = 0; x < an; x++) {
                int i = y * paso + x * 4;
                double d = Math.Sqrt(Math.Pow(px[i]-fb,2) + Math.Pow(px[i+1]-fg,2) + Math.Pow(px[i+2]-fr,2));
                if (d > maxDist) maxDist = d;
            }

        byte[] alfa = new byte[an * al];
        byte[] colR = new byte[an * al], colG = new byte[an * al], colB = new byte[an * al];

        for (int y = 0; y < al; y++)
            for (int x = 0; x < an; x++) {
                int i = y * paso + x * 4;
                double b = px[i], g2 = px[i+1], r = px[i+2];
                double d = Math.Sqrt(Math.Pow(b-fb,2) + Math.Pow(g2-fg,2) + Math.Pow(r-fr,2));
                double a = d / maxDist * 255.0;
                if (a < 26) a = 0;                    // ruido del JPEG
                else a = (a - 26) * 255.0 / (255 - 26);
                if (a > 255) a = 255;

                int j = y * an + x;
                alfa[j] = (byte)a;
                if (a > 0) {
                    // Se despeja el color puro: el pixel es una mezcla del color
                    // real con el fondo segun su opacidad.
                    double k = 255.0 / a;
                    colB[j] = Recorta(fb + (b - fb) * k);
                    colG[j] = Recorta(fg + (g2 - fg) * k);
                    colR[j] = Recorta(fr + (r - fr) * k);
                }
            }

        // Renglones con tinta, para recortar margenes y separar marca y texto
        int[] tinta = new int[al];
        for (int y = 0; y < al; y++) { int s = 0; for (int x = 0; x < an; x++) s += alfa[y*an+x]; tinta[y] = s; }

        int arriba = 0; while (arriba < al && tinta[arriba] == 0) arriba++;
        int abajo = al - 1; while (abajo > arriba && tinta[abajo] == 0) abajo--;

        // El hueco mas alto entre la marca y el renglon de texto
        int corteIni = -1, corteFin = -1, mejor = 0, i0 = -1;
        for (int y = arriba; y <= abajo; y++) {
            if (tinta[y] == 0) { if (i0 < 0) i0 = y; }
            else { if (i0 >= 0 && y - i0 > mejor) { mejor = y - i0; corteIni = i0; corteFin = y; } i0 = -1; }
        }

        int[] columnas = new int[an];
        for (int x = 0; x < an; x++) { int s = 0; for (int y = 0; y < al; y++) s += alfa[y*an+x]; columnas[x] = s; }
        int izq = 0; while (izq < an && columnas[izq] == 0) izq++;
        int der = an - 1; while (der > izq && columnas[der] == 0) der--;

        Guardar(carpeta + "\\cfe.png",            alfa, colR, colG, colB, an, izq, der, arriba, abajo, false, 640);
        Guardar(carpeta + "\\cfe-blanco.png",     alfa, colR, colG, colB, an, izq, der, arriba, abajo, true, 560);

        string detalle = "sin corte";
        if (corteIni > 0) {
            int finMarca = corteIni - 1;
            int[] colMarca = new int[an];
            for (int x = 0; x < an; x++) { int s = 0; for (int y = arriba; y <= finMarca; y++) s += alfa[y*an+x]; colMarca[x] = s; }
            int mi = 0; while (mi < an && colMarca[mi] == 0) mi++;
            int md = an - 1; while (md > mi && colMarca[md] == 0) md--;
            Guardar(carpeta + "\\cfe-marca-blanco.png", alfa, colR, colG, colB, an, mi, md, arriba, finMarca, true, 280);
            detalle = "marca " + (md-mi+1) + "x" + (finMarca-arriba+1) + ", hueco de " + mejor + "px antes del texto";
        }

        return "fondo rgb(" + Math.Round(fr) + "," + Math.Round(fg) + "," + Math.Round(fb) + ") | "
             + "recorte " + (der-izq+1) + "x" + (abajo-arriba+1) + " de " + an + "x" + al + " | " + detalle;
    }

    static byte Recorta(double v) { return (byte)(v < 0 ? 0 : (v > 255 ? 255 : v)); }

    static void Guardar(string destino, byte[] alfa, byte[] r, byte[] g, byte[] b,
                        int anchoOriginal, int x0, int x1, int y0, int y1, bool blanco, int anchoFinal)
    {
        int an = x1 - x0 + 1, al = y1 - y0 + 1;
        Bitmap salida = new Bitmap(an, al, PixelFormat.Format32bppArgb);
        BitmapData d = salida.LockBits(new Rectangle(0, 0, an, al), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] px = new byte[d.Stride * al];
        for (int y = 0; y < al; y++)
            for (int x = 0; x < an; x++) {
                int j = (y + y0) * anchoOriginal + (x + x0);
                int i = y * d.Stride + x * 4;
                byte a = alfa[j];
                px[i]   = (blanco || a == 0) ? (byte)255 : b[j];
                px[i+1] = (blanco || a == 0) ? (byte)255 : g[j];
                px[i+2] = (blanco || a == 0) ? (byte)255 : r[j];
                px[i+3] = a;
            }
        Marshal.Copy(px, 0, d.Scan0, px.Length);
        salida.UnlockBits(d);

        if (anchoFinal > 0 && anchoFinal < an) {
            int nuevoAlto = (int)Math.Round(al * (double)anchoFinal / an);
            Bitmap escalada = new Bitmap(anchoFinal, nuevoAlto, PixelFormat.Format32bppArgb);
            using (Graphics g2 = Graphics.FromImage(escalada)) {
                g2.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g2.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                g2.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                g2.DrawImage(salida, new Rectangle(0, 0, anchoFinal, nuevoAlto));
            }
            salida.Dispose();
            salida = escalada;
        }

        salida.Save(destino, ImageFormat.Png);
        salida.Dispose();
    }
}
'@

Write-Output ([LogoCFE]::Convertir($origen, $carpeta))
Get-ChildItem $carpeta -Filter "cfe*" | ForEach-Object { "  {0,-26} {1,8:N0} B" -f $_.Name, $_.Length }




