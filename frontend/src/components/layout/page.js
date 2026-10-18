/**
 * Khung trang điều hành dùng chung: cùng lề, cùng khoảng cách giữa các khối trên mọi trang (trước đây mỗi trang một kiểu
 * 12 / 14 / 20 px). Điện thoại chừa 112 px dưới cùng cho thanh thao tác nhanh (QuickActionBar). Dải khẩn đầu trang
 * (UrgentStrip, SituationBar) tràn sát mép vùng nội dung theo đúng lề này: EDGE (lề âm) + EDGE_PAD (đệm chữ thẳng mép).
 */
export const PAGE = 'flex flex-col gap-3 p-3 pb-28 sm:gap-4 sm:p-4 sm:pb-8 xl:p-5';
export const EDGE = '-mx-3 -mt-3 sm:-mx-4 sm:-mt-4 xl:-mx-5 xl:-mt-5';
export const EDGE_PAD = 'px-3 sm:px-4 xl:px-5';
