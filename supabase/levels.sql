-- 等级规则初始值。数字按 doTERRA 公开资料整理，上线前请对照 doTERRA 加拿大最新《薪酬计划》核对，
-- 之后可以在网站「管理后台 → 等级规则」里直接修改，不需要再改代码。
insert into levels(kind,code,name_zh,name_en,sort,req_pv,req_lrp_pv,req_ov,req_legs,req_lrp_months,req_points,note_zh,note_en) values
-- 会员等级（客户）
('member','retail','零售客户','Retail Customer',0,null,null,null,null,null,null,'按零售价购买','Buys at retail price'),
('member','wholesale','批发会员','Wholesale Member',1,null,null,null,null,null,null,'入会后享会员价','Member pricing after enrolment'),
('member','lrp','LRP 忠诚会员','Loyalty (LRP) Member',2,null,50,null,null,null,null,'每月有 LRP 订单，累积产品积分','Monthly LRP order, earns product points'),
-- LRP 积分回馈比例（按连续 LRP 月数）
('reward','lrp10','积分回馈 10%','10% points back',0,null,50,null,null,0,null,'刚开始 LRP','Start of LRP'),
('reward','lrp15','积分回馈 15%','15% points back',1,null,50,null,null,3,null,'连续 LRP 满 3 个月','After 3 consecutive LRP months'),
('reward','lrp20','积分回馈 20%','20% points back',2,null,50,null,null,6,null,'连续 LRP 满 6 个月','After 6 consecutive LRP months'),
('reward','lrp25','积分回馈 25%','25% points back',3,null,50,null,null,9,null,'连续 LRP 满 9 个月','After 9 consecutive LRP months'),
('reward','lrp30','积分回馈 30%','30% points back',4,null,50,null,null,12,null,'连续 LRP 满 12 个月','After 12 consecutive LRP months'),
('reward','potm','当月赠品','Product of the Month',5,null,125,null,null,null,null,'当月 LRP 订单达 125 PV（按每月截单日）可获赠当月产品','LRP order of 125 PV by the monthly cut-off earns the free product'),
-- 事业等级
('rank','wa','健康倡导者','Wellness Advocate',0,null,100,null,null,null,null,'每月 LRP 100 PV','100 PV LRP each month'),
('rank','manager','经理','Manager',1,null,100,500,null,null,null,'组织业绩 500 OV','500 OV'),
('rank','director','总监','Director',2,null,100,1000,null,null,null,'组织业绩 1,000 OV','1,000 OV'),
('rank','executive','执行','Executive',3,null,100,2000,null,null,null,'组织业绩 2,000 OV','2,000 OV'),
('rank','elite','精英','Elite',4,null,100,3000,null,null,null,'组织业绩 3,000 OV','3,000 OV'),
('rank','premier','首席','Premier',5,null,100,5000,2,null,null,'5,000 OV，2 条执行级以上的线','5,000 OV with 2 Executive legs'),
('rank','silver','银级','Silver',6,null,100,5000,3,null,null,'3 条精英级以上的线','3 Elite legs'),
('rank','gold','金级','Gold',7,null,100,6000,3,null,null,'3 条首席级以上的线','3 Premier legs'),
('rank','platinum','铂金','Platinum',8,null,100,6000,4,null,null,'4 条首席级以上的线','4 Premier legs'),
('rank','diamond','钻石','Diamond',9,null,100,6000,5,null,null,'5 条首席级以上的线','5 Premier legs'),
('rank','blue_diamond','蓝钻','Blue Diamond',10,null,100,6000,6,null,null,'6 条首席级以上的线','6 Premier legs'),
('rank','presidential','总裁钻石','Presidential Diamond',11,null,100,6000,7,null,null,'7 条首席级以上的线','7 Premier legs'),
-- 奖金等级（能量 3）
('bonus','p3_1','能量 3 第一级','Power of 3 · Level 1',0,null,100,600,3,null,null,'个人 LRP 100 PV，3 位直推各 100 PV LRP，团队 600 TV','100 PV LRP, 3 personally enrolled at 100 PV LRP, 600 TV'),
('bonus','p3_2','能量 3 第二级','Power of 3 · Level 2',1,null,100,3000,3,null,null,'3 位直推各达第一级，团队 3,000 TV','3 personally enrolled at Level 1, 3,000 TV'),
('bonus','p3_3','能量 3 第三级','Power of 3 · Level 3',2,null,100,15000,3,null,null,'3 位直推各达第二级，团队 15,000 TV','3 personally enrolled at Level 2, 15,000 TV')
on conflict (kind,code) do nothing;
