import {
  Boxes, Camera, DatabaseZap, FileCheck2, FileUp, HandHelping, History, House, KeyRound, Landmark, Map, Megaphone,
  Settings2, ShieldCheck, Siren, Sunrise, UserPlus,
} from 'lucide-react';

/**
 * Nội dung hướng dẫn xử lý theo vai trò — trang "Hướng dẫn xử lý" (pages/Guide.jsx) và gợi ý 3 bước đầu mỗi trang
 * (PageTips). Viết theo quy trình của thiết kế Part 1 (A–G) và đúng chữ trên nút của giao diện hiện tại: đổi chữ trên nút
 * nào thì sửa luôn câu hướng dẫn ở đây.
 *
 * 3 nhóm người dùng theo vai trò thật (rbac — useGuideRole): 'tinh' Quản trị tỉnh (lãnh đạo BCH, trực ban), 'xa' Quản trị
 * xã/phường, 'quan_tri' Quản trị hệ thống.
 */
export const GUIDE_ROLES = [
  { value: 'tinh', label: 'Cán bộ cấp tỉnh', short: 'Cấp tỉnh', icon: Landmark, who: 'Lãnh đạo Ban Chỉ huy PCTT & TKCN tỉnh, cán bộ trực ban' },
  { value: 'xa', label: 'Cán bộ cấp xã', short: 'Cấp xã', icon: House, who: 'Chỉ huy, cán bộ Ban Chỉ huy PCTT & TKCN xã, phường' },
  { value: 'quan_tri', label: 'Quản trị hệ thống', short: 'Quản trị', icon: Settings2, who: 'Cán bộ phụ trách tài khoản, danh mục dữ liệu, trạm đo' },
];

/**
 * Gợi ý 3 bước đầu mỗi trang theo nhóm người dùng. Nhóm không có câu riêng → dùng câu của cấp tỉnh (Quản trị hệ thống làm
 * được mọi việc của cấp tỉnh).
 */
export const PAGE_TIPS = {
  'tong-quan': {
    tinh: [
      'Đọc câu tóm tắt trên cùng: tình hình chung và chỗ nguy hiểm nhất. Dải đỏ là việc khẩn.',
      'Xử lý "Việc chờ quyết định": bấm từng việc để tới thẳng chỗ duyệt lệnh, điều động.',
      'Bấm ô chỉ số hoặc điểm trên bản đồ để xem chi tiết; nút "?" giải thích thuật ngữ.',
    ],
    xa: [
      'Thẻ đầu trang là của xã mình: phiếu cứu hộ đang mở, sơ tán, cảnh báo, mưa dự báo.',
      'Cần tỉnh giúp người, xuồng, lương thực: bấm "Gửi yêu cầu chi viện lên tỉnh".',
      'Người dân báo gặp nạn: bấm "Báo cáo nhanh" (điện thoại: nút đỏ "Báo SOS" ở dưới) để tạo phiếu.',
    ],
    quan_tri: [
      'Thẻ "Hệ thống & dữ liệu": trạm, nguồn số liệu nào đang lỗi — xử lý ở "Nguồn dữ liệu".',
      '"Việc chờ quyết định" có hồ sơ xã gửi chờ duyệt: bấm để duyệt hoặc trả lại.',
      'Cán bộ mới, quên mật khẩu, mất máy: vào "Phân quyền" ở cuối menu.',
    ],
  },
  'cuu-ho': {
    tinh: [
      'Cột "Mới báo — chưa ai nhận" đã xếp sẵn: quá hạn trước, rồi cấp 1 Đỏ. Làm từ trên xuống.',
      'Bấm "Điều đội" trên thẻ: chọn đội được gợi ý, vật tư mang theo, xác nhận rồi phát lệnh.',
      'Đội báo đã tới: bấm "Đội đã đến". Người dân an toàn: bấm "Xác nhận đã cứu" để đóng phiếu.',
    ],
    xa: [
      'Ở đây là phiếu cứu hộ của xã mình. Phiếu mới: gọi xác minh rồi bấm "Nhận phiếu".',
      'Tỉnh điều đội đến: theo dõi ở cột "Đội đang đến"; nút "Gọi" để gọi người báo tin.',
      'Người dân đã an toàn: bấm "Xác nhận đã cứu". Cần thêm lực lượng: gửi yêu cầu chi viện lên tỉnh.',
    ],
  },
  'canh-bao': {
    tinh: [
      'Lãnh đạo có mã PIN: lệnh chờ bạn nằm ở khối "Chờ bạn duyệt" — đọc tin xem trước, bấm "Duyệt bằng PIN" hoặc "Trả lại".',
      'Trực ban soạn lệnh 3 bước: chạm thẻ mẫu tin (xả lũ, sạt lở, bão…) và điền chỗ trống → chọn xã → kênh, rồi "Gửi lãnh đạo phê duyệt".',
      'Đã phát: thẻ lệnh ghi bằng lời tin đã tới bao nhiêu người theo từng kênh; kênh chưa nối ghi rõ "chưa gửi được".',
    ],
    xa: [
      'Ở đây là các lệnh cảnh báo đang có hiệu lực tại xã mình. Cán bộ xã xem, không soạn lệnh.',
      'Nhận lệnh: phổ biến ngay qua loa xã, trưởng thôn; làm theo nội dung (sơ tán, cấm qua ngầm…).',
      'Cần gọi chỉ huy cấp trên, xã bên cạnh: mở thẻ "Danh bạ & Tổng đài", bấm số để gọi.',
    ],
  },
  'nguon-luc': {
    tinh: [
      'Khối "Cần bổ sung / cần sửa" dưới ô chỉ số: kho thiếu hàng, hàng sắp hết hạn, xe hỏng — mỗi việc một nút xử lý.',
      'Thẻ "Lực lượng": bấm "Điều động nhanh" để giao một đội cho phiếu cứu hộ đang chờ.',
      'Thẻ "Kho vật tư": vạch màu cho biết còn bao nhiêu so với định mức; "Xuất kho" khi cấp hàng cho đội, cho dân.',
    ],
    xa: [
      'Bạn thấy lực lượng, kho, phương tiện của xã mình.',
      'Cấp hàng cho dân, cho đội cứu hộ: bấm "Xuất kho", chọn kho, mặt hàng, số lượng.',
      'Nhận hàng tỉnh cấp: bấm "Nhập kho". Xuồng, xe hỏng: báo tình trạng ở thẻ "Phương tiện".',
    ],
  },
  'ban-do': {
    tinh: [
      '"Xem tình hình" chỉ hiện rủi ro; "Điều hành" thêm đội cứu hộ, kho, điểm sơ tán để điều đội.',
      '"Lớp dữ liệu": bật, tắt từng lớp — mưa, vùng ngập, sạt lở, điểm cầu cứu; "Về mặc định" để trở lại.',
      'Kéo đội cứu hộ thả vào điểm cầu cứu để điều động; thanh thời gian (nút Phát) xem 12 giờ trước tới 24 giờ tới.',
    ],
    xa: [
      'Bản đồ mở sẵn xã mình: điểm sạt lở, vùng ngập, điểm sơ tán quanh xã.',
      '"Lớp dữ liệu": bật, tắt từng lớp; "Về mặc định" để trở lại như cũ.',
      'Chạm một điểm để xem chi tiết. Người gặp nạn: bấm "Báo SOS" (điện thoại) hoặc "Báo cáo nhanh".',
    ],
  },
  'phan-anh': {
    tinh: [
      'Phản ánh người dân gửi qua cổng công khai (ảnh, vị trí) nằm ở đây, mới nhất trên cùng.',
      'Đúng sự thật: "Duyệt công khai" để hiện trên bản đồ cho người dân. Sai, trùng: "Từ chối".',
      'Có người gặp nạn: bấm "Chuyển SOS" để tạo phiếu cứu hộ ngay.',
    ],
  },
  'nhap-du-lieu': {
    tinh: [
      'Chọn thẻ loại dữ liệu cần cập nhật (điểm sơ tán, kho, danh bạ…).',
      'Bấm "Tải mẫu Excel", điền đè lên dòng ví dụ rồi chọn tệp: máy kiểm tra ngay, báo lỗi theo từng dòng kèm cách sửa.',
      'Hết lỗi bấm "Ghi vào hệ thống". Hồ sơ xã gửi lên ở thẻ "Hồ sơ xã/phường gửi": Duyệt hoặc Trả lại kèm lý do.',
    ],
    xa: [
      'Chọn thẻ loại dữ liệu của xã (điểm sơ tán, xóm, danh bạ, kho…).',
      'Bấm "Tải mẫu Excel", mỗi dòng một điểm — ít điểm thì chọn "Điền trực tiếp trên web". Chọn tệp, máy kiểm tra ngay.',
      'Hết lỗi bấm "Gửi tỉnh duyệt". Theo dõi ở thẻ "Hồ sơ đã gửi": tỉnh duyệt xong mới hiện trên hệ thống.',
    ],
    quan_tri: [
      'Danh mục gốc của tỉnh (ranh giới xã, trạm đo, hồ chứa, kho…): chọn thẻ loại dữ liệu.',
      'Bấm "Tải mẫu Excel", điền rồi chọn tệp — máy kiểm tra ngay; chỉ ghi khi không còn dòng lỗi.',
      'Hồ sơ xã gửi lên: thẻ "Hồ sơ xã/phường gửi" — xem hiện tại và sau khi duyệt, rồi Duyệt hoặc Trả lại kèm lý do.',
    ],
  },
  'nguon-du-lieu': {
    tinh: [
      'Mỗi thẻ là một nguồn số liệu (dự báo, cổng nhận số đo) kèm một câu: đang về đều hay đã lỗi, từ lúc nào.',
      'Thẻ "Thiết bị đo": thiết bị nào mất tín hiệu, từ lúc nào.',
      'Nguồn lỗi: bấm "Thử lại ngay"; vẫn lỗi thì báo đơn vị kỹ thuật (chi tiết lỗi ở mục "Nâng cao").',
    ],
    quan_tri: [
      'Mỗi nguồn một câu trạng thái; chi tiết kỹ thuật (mã, khoá, câu lệnh gửi thử) ở mục "Nâng cao".',
      'Lắp thiết bị mới: thẻ "Thiết bị đo" → "Đăng ký thiết bị đo", gắn với trạm, cài khoá vào thiết bị.',
      'Thẻ "Tình trạng nhận số liệu": số đo nhận được, bị loại, lỗi trong 24 giờ.',
    ],
  },
  'phan-quyen': {
    tinh: [
      'Cấp tỉnh tạo và quản lý tài khoản cán bộ xã (Quản trị xã/phường) trong toàn tỉnh.',
      'Cán bộ xã mới: "Tạo tài khoản công vụ", làm theo 4 bước, giao mật khẩu tạm tận tay người đó.',
      'Quên mật khẩu: "Đặt lại mật khẩu"; mất máy, nghỉ việc: "Khoá" — máy hỏi lại, nói rõ hậu quả trước khi làm.',
    ],
    quan_tri: [
      'Mỗi tài khoản đúng một cấp: Quản trị hệ thống, Quản trị tỉnh, Quản trị xã/phường — xem ô giải thích đầu trang.',
      'Cán bộ mới: "Tạo tài khoản công vụ" → cấp & địa bàn → thông tin → đăng nhập → xem lại rồi tạo.',
      'Quên mật khẩu: "Đặt lại mật khẩu"; mất máy, nghỉ việc: "Khoá" — máy hỏi lại, nói rõ hậu quả trước khi làm.',
    ],
  },
};

/** Câu gợi ý của một trang cho nhóm người dùng (thiếu → câu của cấp tỉnh); null nếu trang không có gợi ý. */
export const tipsFor = (page, role) => PAGE_TIPS[page]?.[role] || PAGE_TIPS[page]?.tinh || null;

/**
 * Tình huống xử lý theo vai trò (trang Hướng dẫn xử lý). Mỗi tình huống: khi nào gặp, các bước theo đúng thứ tự làm việc,
 * lưu ý (nếu có), nút mở thẳng màn hình xử lý.
 */
export const SCENARIOS = {
  tinh: [
    {
      id: 'dau-ca',
      art: 'dau-ca', // hình nét đơn (EmptyArt) trên thẻ tình huống
      icon: Sunrise,
      title: 'Nắm tình hình đầu ca trực',
      when: 'Đầu ca, khi có tin mưa lớn, hồ xả lũ',
      to: '/dashboard',
      cta: 'Mở Tổng quan',
      steps: [
        'Đọc câu tóm tắt trên cùng trang Tổng quan: trạm nào vượt báo động, bao nhiêu phiếu cứu hộ chờ, hồ nào đang xả.',
        'Làm hết "Việc chờ quyết định" — mỗi dòng có nút đi thẳng tới chỗ xử lý.',
        'Cần chi tiết: xem "Điểm nóng trên bản đồ", các thẻ "Hồ chứa & xả lũ", "Sạt lở & đường đèo".',
        'Báo cáo nhanh UBND tỉnh: nút "Xuất" → "Ảnh chụp tình hình (PDF)".',
      ],
    },
    {
      id: 'sos',
      art: 'sos',
      icon: Siren,
      title: 'Có tin báo cứu hộ',
      when: 'Người dân gọi điện, nhắn Zalo, xã báo lên, phiếu mới hiện trên bảng',
      to: '/cuu-ho',
      cta: 'Mở Điều hành cứu hộ',
      steps: [
        'Tin đến qua điện thoại, Zalo: bấm "Báo cáo nhanh" trên thanh trên cùng, ghi ai, ở đâu, mấy người, chuyện gì.',
        'Ở cột "Mới báo — chưa ai nhận", làm phiếu trên cùng trước — đã xếp sẵn: quá hạn, rồi cấp 1 Đỏ, rồi phiếu đến trước.',
        'Bấm "Điều đội": 3 bước — chọn đội được gợi ý (gần, đủ người, đúng kỹ năng) → vật tư mang theo → xác nhận và phát lệnh.',
        'Phát lệnh xong: bấm "Gọi trưởng nhóm" hoặc "Sao chép lệnh gửi Zalo"; link nhiệm vụ đã kèm trong lệnh.',
        'Đội báo đã tới: bấm "Đội đã đến". Người dân an toàn: bấm "Xác nhận đã cứu" để đóng phiếu.',
      ],
      note: 'Hạn phản hồi: cấp 1 Đỏ 3 phút, cấp 2 Cam 15 phút, cấp 3 Vàng 60 phút. Thẻ phiếu ghi rõ "Chờ 5 phút — quá hạn 2 phút"; quá hạn có viền đỏ.',
    },
    {
      id: 'chi-vien',
      art: 'chi-vien',
      icon: HandHelping,
      title: 'Xã xin chi viện',
      when: 'Phiếu có nhãn đỏ "Xã xin chi viện"',
      to: '/cuu-ho',
      cta: 'Xem phiếu xin chi viện',
      steps: [
        'Phiếu xin chi viện nằm ở cột "Mới báo — chưa ai nhận" của trang Điều hành cứu hộ, đầu thẻ có dải đỏ "Xã xin chi viện".',
        'Gọi chỉ huy xã để nắm rõ cần người, xuồng, máy xúc hay lương thực.',
        'Cần lực lượng: bấm "Điều đội". Cần hàng: trang "Vật tư & Lực lượng" → "Xuất kho" từ kho gần nhất.',
      ],
    },
    {
      id: 'soan-canh-bao',
      art: 'canh-bao',
      icon: Megaphone,
      title: 'Soạn lệnh cảnh báo cho người dân',
      when: 'Hồ chuẩn bị xả lũ, nguy cơ sạt lở, bão sắp đổ bộ',
      to: '/canh-bao',
      cta: 'Mở Cảnh báo & Hotline',
      steps: [
        'Mở "Cảnh báo & Hotline", thẻ "Phát cảnh báo", khối soạn lệnh.',
        'Bước 1 — chạm thẻ mẫu tin (Hồ chứa xả lũ, Yêu cầu di dời do sạt lở, Bão…), điền chỗ trống theo ví dụ trong ô: giờ, lưu lượng, địa điểm.',
        'Bước 2 — chọn xã nhận tin (hoặc khoanh vùng trên Bản đồ rồi chuyển sang).',
        'Bước 3 — chọn kênh gửi, xem tin trên khung điện thoại đúng như người dân nhận, bấm "Gửi lãnh đạo phê duyệt".',
      ],
      note: 'Người soạn không tự duyệt lệnh của mình. Tin chỉ tới người dân sau khi lãnh đạo ký duyệt bằng mã PIN.',
    },
    {
      id: 'duyet-canh-bao',
      art: 'duyet',
      icon: ShieldCheck,
      title: 'Lãnh đạo duyệt lệnh cảnh báo',
      when: 'Menu "Cảnh báo & Hotline" có số đỏ — lệnh đang chờ bạn',
      to: '/canh-bao',
      cta: 'Xem lệnh chờ duyệt',
      steps: [
        'Mở "Cảnh báo & Hotline": lệnh chờ bạn nằm ở khối "Chờ bạn duyệt", tin xem trước đúng như người dân nhận.',
        'Đọc nội dung, xã nhận tin, số hộ nhận. Lệnh có nhãn "Máy đề xuất" là hệ thống tự soạn khi trạm đo vượt ngưỡng.',
        'Bấm "Duyệt bằng PIN", nhập mã PIN, bấm "Ký duyệt & phát". Chưa đồng ý: bấm "Trả lại", ghi lý do để trực ban sửa.',
      ],
      note: 'Chưa có mã PIN: đề nghị Quản trị hệ thống cấp ở trang Phân quyền.',
    },
    {
      id: 'vat-tu',
      art: 'kho',
      icon: Boxes,
      title: 'Kiểm tra kho, cấp hàng cứu trợ',
      when: 'Kho báo đỏ (dưới 20% định mức), cần cấp hàng cho đội, cho dân',
      to: '/nguon-luc',
      cta: 'Mở Vật tư & Lực lượng',
      steps: [
        'Khối "Cần bổ sung / cần sửa" trên trang "Vật tư & Lực lượng" ghi từng việc: kho nào dưới 20% định mức, hàng nào sắp hết hạn, xe nào hỏng — bấm nút ngay dòng đó.',
        'Thẻ "Kho vật tư": xem từng kho còn bao nhiêu so với định mức.',
        'Cấp hàng: bấm "Xuất kho" → chọn kho → mặt hàng, số lượng, lý do. Hàng về: "Nhập kho".',
      ],
    },
    {
      id: 'ban-do',
      art: 'ban-do',
      icon: Map,
      title: 'Theo dõi trên bản đồ khi mưa lũ',
      when: 'Cần thấy chỗ ngập, sạt lở, đội nào ở gần một điểm cầu cứu',
      to: '/ban-do',
      cta: 'Mở Bản đồ giám sát',
      steps: [
        'Chọn "Xem tình hình" để chỉ xem rủi ro; "Điều hành" để thấy thêm đội cứu hộ, kho, điểm sơ tán.',
        'Bấm "Lớp dữ liệu" để bật, tắt từng lớp: mưa & mực nước, vùng nguy hiểm, lực lượng & kho, người dân cầu cứu.',
        'Kéo thanh thời gian ở dưới (hoặc bấm nút Phát) để xem từ 12 giờ trước tới 24 giờ tới.',
        'Ở chế độ "Điều hành": kéo biểu tượng đội cứu hộ thả vào điểm cầu cứu để mở lệnh điều động.',
        'Khoanh vùng nguy hiểm để đếm số hộ trong vùng và chuyển sang soạn cảnh báo.',
      ],
    },
    {
      id: 'ho-so-xa',
      art: 'phieu',
      icon: FileCheck2,
      title: 'Duyệt dữ liệu xã gửi lên',
      when: 'Menu "Nhập dữ liệu" có số màu cam',
      to: '/nhap-du-lieu?tab=ho-so',
      cta: 'Xem hồ sơ chờ duyệt',
      steps: [
        'Mở "Nhập dữ liệu", thẻ "Hồ sơ xã/phường gửi".',
        'Xem bản đồ và bảng "Hiện tại → Sau khi duyệt" của hồ sơ (điểm sơ tán, danh bạ, kho…).',
        'Đúng: bấm "Duyệt" — dữ liệu ghi vào hệ thống. Sai: "Trả lại" kèm lý do để xã sửa.',
      ],
    },
  ],
  xa: [
    {
      id: 'xa-dau-ngay',
      art: 'dau-ca',
      icon: Sunrise,
      title: 'Mở máy đầu ngày, khi trời mưa lớn',
      when: 'Mỗi sáng, khi có tin mưa lũ, khi nhận cảnh báo',
      to: '/dashboard',
      cta: 'Mở trang của xã',
      steps: [
        'Trang Tổng quan mở thẳng thẻ của xã: phiếu cứu hộ đang mở, sơ tán, cảnh báo, mưa dự báo 72 giờ.',
        'Ô có viền đỏ là việc gấp — bấm vào để xem.',
        'Bản đồ chỉ hiện xã mình: xem điểm sạt lở, ngập, điểm sơ tán quanh xã.',
      ],
    },
    {
      id: 'xa-bao-nan',
      art: 'sos',
      icon: Siren,
      title: 'Người dân báo gặp nạn',
      when: 'Có người gọi, nhắn báo mắc kẹt, nhà sập, cần cấp cứu',
      to: '/cuu-ho',
      cta: 'Mở Điều hành cứu hộ',
      steps: [
        'Bấm "Báo cáo nhanh" trên thanh trên cùng (điện thoại: nút đỏ "Báo SOS" ở dưới cùng).',
        'Ghi người báo, số điện thoại, ở đâu (đang ở hiện trường thì lấy vị trí), mấy người, có người già, trẻ em không.',
        'Gửi: phiếu hiện ngay ở trực ban tỉnh. Xã đã gọi xác minh thì bấm "Nhận phiếu" trên thẻ phiếu.',
        'Lực lượng xã tự cứu được: cứu xong bấm "Xác nhận đã cứu".',
      ],
    },
    {
      id: 'xa-chi-vien',
      art: 'chi-vien',
      icon: HandHelping,
      title: 'Xã cần tỉnh chi viện',
      when: 'Vượt khả năng của xã: cần thêm người, xuồng, máy xúc, lương thực',
      to: '/dashboard',
      cta: 'Gửi yêu cầu chi viện',
      steps: [
        'Trang Tổng quan: bấm nút đỏ "Gửi yêu cầu chi viện lên tỉnh" (điện thoại: nút "Chi viện" ở dưới cùng).',
        'Ghi cần gì, cho bao nhiêu người, ở đâu.',
        'Gửi: trực ban tỉnh thấy phiếu có nhãn "Xã xin chi viện" và liên lạc lại với xã.',
      ],
    },
    {
      id: 'xa-so-tan',
      art: 'so-tan',
      icon: House,
      title: 'Cập nhật sơ tán dân',
      when: 'Đang di dời dân, điểm sơ tán đón thêm người',
      to: '/dashboard',
      cta: 'Cập nhật sơ tán',
      steps: [
        'Trang Tổng quan: bấm "Cập nhật sơ tán".',
        'Ghi số hộ, số người đã tới nơi an toàn, số người đang ở từng điểm sơ tán.',
        'Tỉnh thấy ngay tiến độ của xã; điểm sơ tán gần đầy sẽ được báo để chuyển dân sang điểm khác.',
      ],
    },
    {
      id: 'xa-canh-bao',
      art: 'canh-bao',
      icon: Megaphone,
      title: 'Nhận lệnh cảnh báo của tỉnh',
      when: 'Có lệnh xả lũ, di dời do sạt lở, bão đổ bộ cho xã mình',
      to: '/canh-bao',
      cta: 'Xem lệnh đang hiệu lực',
      steps: [
        'Lệnh đang hiệu lực ở xã hiện trên trang Tổng quan và trang "Cảnh báo & Hotline".',
        'Phổ biến ngay qua loa xã, trưởng thôn, tổ dân phố; làm theo nội dung lệnh.',
        'Cần gọi chỉ huy cấp trên, xã bên cạnh: thẻ "Danh bạ & Tổng đài".',
      ],
      note: 'Cán bộ xã không soạn lệnh cảnh báo. Cần phát tin cho dân: đề nghị trực ban tỉnh.',
    },
    {
      id: 'xa-kho',
      art: 'kho',
      icon: Boxes,
      title: 'Xuất, nhập kho của xã',
      when: 'Cấp gạo, mì, nước, áo phao cho dân, cho đội; nhận hàng tỉnh cấp',
      to: '/nguon-luc',
      cta: 'Mở Vật tư & Lực lượng',
      steps: [
        'Mở "Vật tư & Lực lượng": chỉ thấy kho, lực lượng, phương tiện của xã.',
        'Cấp hàng: "Xuất kho" → chọn kho → mặt hàng, số lượng, lý do.',
        'Nhận hàng: "Nhập kho". Xuồng, xe hỏng: báo tình trạng để tỉnh biết.',
      ],
    },
    {
      id: 'xa-phan-anh',
      art: 'anh',
      icon: Camera,
      title: 'Duyệt phản ánh của người dân',
      when: 'Menu "Phản ánh người dân" có số màu cam',
      to: '/phan-anh',
      cta: 'Mở Phản ánh người dân',
      steps: [
        'Xem ảnh, vị trí, nội dung người dân gửi.',
        'Đúng sự thật: "Duyệt công khai". Sai, trùng: "Từ chối".',
        'Có người gặp nạn: "Chuyển SOS" để tạo phiếu cứu hộ ngay.',
      ],
    },
    {
      id: 'xa-du-lieu',
      art: 'du-lieu',
      icon: FileUp,
      title: 'Gửi danh sách điểm sơ tán, kho, danh bạ của xã',
      when: 'Đầu mùa mưa bão, khi danh sách có thay đổi',
      to: '/nhap-du-lieu',
      cta: 'Mở Nhập dữ liệu',
      steps: [
        'Mở "Nhập dữ liệu", chọn thẻ loại (điểm sơ tán, danh bạ, kho vật tư…), bấm "Tải mẫu Excel".',
        'Điền đè lên dòng ví dụ, mỗi dòng một điểm — hoặc chọn "Điền trực tiếp trên web".',
        'Chọn tệp: máy kiểm tra ngay; sửa hết dòng báo lỗi (có ghi cách sửa) rồi bấm "Gửi tỉnh duyệt".',
        'Theo dõi ở thẻ "Hồ sơ đã gửi": tỉnh duyệt xong mới hiện trên hệ thống; bị trả lại thì sửa theo lý do rồi gửi lại.',
      ],
    },
  ],
  quan_tri: [
    {
      id: 'qt-tai-khoan',
      art: 'tai-khoan',
      icon: UserPlus,
      title: 'Tạo tài khoản cho cán bộ mới',
      when: 'Có cán bộ mới nhận nhiệm vụ ở tỉnh hoặc xã',
      to: '/phan-quyen',
      cta: 'Mở Phân quyền',
      steps: [
        'Mở "Phân quyền", bấm "Tạo tài khoản công vụ".',
        'Bước 1 chọn cấp: Quản trị tỉnh cho cán bộ tỉnh, Quản trị xã/phường cho cán bộ xã (chọn đúng xã).',
        'Ghi họ tên, chức vụ, tên đăng nhập, mật khẩu tạm; xem lại rồi tạo — giao mật khẩu tận tay, lần đầu đăng nhập phải đổi.',
        'Lãnh đạo duyệt cảnh báo: cấp thêm mã PIN ở bước "Đăng nhập".',
      ],
      note: 'Mỗi tài khoản đúng một cấp. Chỉ cấp trên quản lý cấp dưới; cùng cấp không đổi mật khẩu của nhau.',
    },
    {
      id: 'qt-mat-khau',
      art: 'khoa',
      icon: KeyRound,
      title: 'Cán bộ quên mật khẩu, mất điện thoại, nghỉ việc',
      when: 'Có người báo không đăng nhập được, mất máy, chuyển công tác',
      to: '/phan-quyen',
      cta: 'Mở Phân quyền',
      steps: [
        'Tìm tài khoản theo tên ở trang "Phân quyền".',
        'Quên mật khẩu, mã PIN: bấm "Đặt lại mật khẩu" (cấp tỉnh: "Mật khẩu / PIN"), giao mật khẩu mới tận tay.',
        'Mất máy, nghỉ việc: bấm "Khoá" — người đó bị đăng xuất ngay trên mọi máy.',
      ],
    },
    {
      id: 'qt-nguon',
      art: 'mat-mang',
      icon: DatabaseZap,
      title: 'Trạm đo, nguồn dự báo không gửi số liệu',
      when: 'Thẻ "Hệ thống & dữ liệu" báo lỗi, biểu đồ đứng yên',
      to: '/nguon-du-lieu',
      cta: 'Mở Nguồn dữ liệu',
      steps: [
        'Mở "Nguồn dữ liệu": nguồn có nhãn đỏ "Lỗi" là đang không lấy được số liệu — câu bên dưới ghi từ lúc nào.',
        'Thẻ "Thiết bị đo": thiết bị nào mất tín hiệu, từ lúc nào.',
        'Bấm "Thử lại ngay" cho nguồn dự báo; trạm hỏng thì báo đơn vị lắp đặt kèm tên trạm, giờ mất tín hiệu.',
      ],
    },
    {
      id: 'qt-danh-muc',
      art: 'du-lieu',
      icon: FileUp,
      title: 'Cập nhật danh mục gốc của tỉnh',
      when: 'Có ranh giới xã mới, trạm đo, hồ chứa, kho mới',
      to: '/nhap-du-lieu',
      cta: 'Mở Nhập dữ liệu',
      steps: [
        'Mở "Nhập dữ liệu", chọn thẻ loại dữ liệu, bấm "Tải mẫu Excel".',
        'Điền rồi chọn tệp: máy kiểm tra ngay, báo lỗi theo từng dòng kèm cách sửa.',
        'Hết lỗi mới "Ghi vào hệ thống" — ghi toàn bộ hoặc không ghi gì, không có dữ liệu nửa chừng.',
      ],
    },
    {
      id: 'qt-ho-so',
      art: 'phieu',
      icon: FileCheck2,
      title: 'Duyệt dữ liệu xã gửi lên',
      when: 'Menu "Nhập dữ liệu" có số màu cam',
      to: '/nhap-du-lieu?tab=ho-so',
      cta: 'Xem hồ sơ chờ duyệt',
      steps: [
        'Mở "Nhập dữ liệu", thẻ "Hồ sơ xã/phường gửi".',
        'Xem bản đồ và bảng "Hiện tại → Sau khi duyệt".',
        'Đúng: bấm "Duyệt" — dữ liệu ghi vào hệ thống. Sai: "Trả lại" kèm lý do để xã sửa.',
      ],
    },
    {
      id: 'qt-nhat-ky',
      art: 'tim',
      icon: History,
      title: 'Tra cứu ai đã làm gì',
      when: 'Rút kinh nghiệm sau thiên tai, kiểm tra thao tác bất thường',
      to: '/canh-bao?tab=nhat_ky',
      cta: 'Mở nhật ký pháp lý',
      steps: [
        'Mở "Cảnh báo & Hotline", thẻ "Nhật ký pháp lý": mọi thao tác điều hành, tài khoản, bảo mật — ai làm, việc gì, lúc nào.',
        'Lọc theo khoảng thời gian, nhóm thao tác, người thực hiện.',
        'Riêng việc cấp, đổi quyền tài khoản: trang "Phân quyền", thẻ "Nhật ký thao tác".',
      ],
    },
  ],
};

/** Hạn phản hồi phiếu cứu hộ theo mức ưu tiên (đồng bộ backend app/services/sos.py SLA_MINUTES). */
export const RESPONSE_LEVELS = [
  { level: 3, name: 'Cấp 1 — Đỏ', meaning: 'Khẩn cấp sinh tử: mắc kẹt trong dòng nước xiết, sạt lở vùi nhà, người bị thương nặng', minutes: 3 },
  { level: 2, name: 'Cấp 2 — Cam', meaning: 'Nguy hiểm: nước ngập sâu, cạn lương thực, người già, trẻ em cần di dời', minutes: 15 },
  { level: 1, name: 'Cấp 3 — Vàng', meaning: 'Hỗ trợ: tiếp tế nước uống, điện, thuốc men thông thường', minutes: 60 },
];
