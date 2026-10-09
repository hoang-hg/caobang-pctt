# Font cho báo cáo PDF định dạng chuẩn

`Tinos-Regular/Bold/Italic.ttf`: font Tinos (kiểu chữ Times, giấy phép SIL OFL 1.1, xem `OFL.txt`), tải từ
github.com/google/fonts (`ofl/tinos`), **cắt còn chữ Latin + tiếng Việt** (fontTools `pyftsubset`, ~40 KB mỗi tệp thay vì
~550 KB). jsPDF chỉ nhúng được font TTF; font mặc định của jsPDF không có dấu tiếng Việt.

Chỉ tải khi người dùng bấm xuất báo cáo (`utils/reportPdf.js` nạp động), không nằm trong gói tải đầu tiên hay bộ nhớ đệm
service worker.

Dải ký tự đã giữ: `U+0020-007E, U+00A0-00FF, U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1,
U+01AF-01B0, U+0300-0301, U+0303, U+0309, U+0323, U+1EA0-1EF9, U+2013-2014, U+2018-201D, U+2022, U+2026, U+20AB, U+2116,
U+2190-2193, U+2212, U+2264-2265`. Cần thêm ký tự → cắt lại từ bản gốc với dải mới.
