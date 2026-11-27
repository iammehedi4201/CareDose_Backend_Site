-- CareDose Packaging Cleanup — HIGH-Confidence Strip Metadata Fix (40 records)
-- Generated from reviewed_strip_cleanup_manifest.json
-- DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL AND VERIFIED BACKUP
-- Scope: Sets stripUnits = NULL ONLY on the 40 HIGH-confidence packs where packUnits matches label & price math
--        and stripUnits was inherited from a divisible sibling pack.
-- Preserves id, brandId, packQuantity, packUnits, unitPrice, packPrice, currency, warnings, verification.

BEGIN;

-- Simpli (500 mg Tablet) | 8's pack | old packUnits=8, old stripUnits=6
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '9fff8cc2-864d-4396-96a6-feca85c5656d' AND "brandId" = '0087d9aa-b908-431d-9db2-29678eec0093' AND "packUnits" = 8 AND "stripUnits" = 6;
-- Cinaron Plus (20 mg+40 mg Tablet) | 100's pack | old packUnits=100, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'd5219536-bc18-4d08-8e72-e49cfc9f8102' AND "brandId" = '02e9a52b-ff57-4ac0-ad83-9d5ff0654d57' AND "packUnits" = 100 AND "stripUnits" = 14;
-- Metacard MR (35 mg Tablet (Modified Release)) | 60's pack | old packUnits=60, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '68bf2c78-ece4-4d89-b021-fe8dfd7a855d' AND "brandId" = '0ce427bd-cf3f-44cf-9224-02cb99cc8ee5' AND "packUnits" = 60 AND "stripUnits" = 14;
-- Kefuclav (250 mg+62.5 mg Tablet) | 14's pack | old packUnits=14, old stripUnits=8
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '84fc9455-b1fb-4890-b3b4-ed269242d7b8' AND "brandId" = '0e0cff75-25be-4333-89be-fc696fb28e37' AND "packUnits" = 14 AND "stripUnits" = 8;
-- Joytrip (150 mcg Chewable Tablet) | 50's pack | old packUnits=50, old stripUnits=4
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '58f3f610-10c1-4ab9-83fe-0e5c488d3d19' AND "brandId" = '1039c1fd-fc30-4c05-a036-e0f8414659b8' AND "packUnits" = 50 AND "stripUnits" = 4;
-- Histal (4 mg Tablet) | 408's pack | old packUnits=408, old stripUnits=40
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '00789a0e-ed69-4b92-b4a8-bca074666f5f' AND "brandId" = '17cf817b-4a3d-4ba5-8cee-39821b4e2bff' AND "packUnits" = 408 AND "stripUnits" = 40;
-- Angicard (0.5 mg Sublingual Tablet) | 100's pack | old packUnits=100, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'bc855812-7c27-4fc4-a97e-594559f3f2ef' AND "brandId" = '1a267175-41e6-46e8-a48f-327900aca873' AND "packUnits" = 100 AND "stripUnits" = 14;
-- Napronil Plus (500 mg+20 mg Tablet (Delayed Release)) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'b5f4768c-45a7-4889-8b19-f22f33a3894e' AND "brandId" = '203fca6c-d62b-40ed-9b14-5292843136f9' AND "packUnits" = 28 AND "stripUnits" = 10;
-- Esoprex (20 mg Capsule (Enteric Coated)) | 56's pack | old packUnits=56, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '2337724d-2cf8-4e15-abfe-805d958d227a' AND "brandId" = '210534e0-8cb0-41b4-b04e-70b5b5cdf713' AND "packUnits" = 56 AND "stripUnits" = 10;
-- Flexibac (5 mg Tablet) | 50's pack | old packUnits=50, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'e9916a4f-b465-4d40-b94c-15a259803895' AND "brandId" = '270f6fbf-2eda-4170-81d3-852940035f61' AND "packUnits" = 50 AND "stripUnits" = 15;
-- AH (400 mg Chewable Tablet) | 60's pack | old packUnits=60, old stripUnits=8
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '5ee6ac20-d64e-4630-b830-da072111e6aa' AND "brandId" = '33b36f1f-5509-4c3c-9fe3-1f3ce2f5592e' AND "packUnits" = 60 AND "stripUnits" = 8;
-- Tofen (1 mg Tablet) | 200's pack | old packUnits=200, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'a9e09da5-cc67-4ea0-95f0-e72406825f66' AND "brandId" = '36e19cb7-3a8c-4a34-86dd-e48764acd095' AND "packUnits" = 200 AND "stripUnits" = 15;
-- Kefuclav (500 mg+125 mg Tablet) | 8's pack | old packUnits=8, old stripUnits=7
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'ef23d981-d21d-4491-9a15-4d431b4dbc78' AND "brandId" = '4148f076-4e8d-4ace-989e-be22d3604fa0' AND "packUnits" = 8 AND "stripUnits" = 7;
-- NexCap (40 mg Capsule (Enteric Coated)) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '2d614de7-64a6-441a-b6c5-efff8d0869e2' AND "brandId" = '4c0cd742-0674-4e86-8f1c-8aac9c4a9fa6' AND "packUnits" = 28 AND "stripUnits" = 10;
-- Winbac (500 mg Tablet) | 20's pack | old packUnits=20, old stripUnits=7
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '8d188ba4-deef-43e1-b00a-3463a4a9b1f6' AND "brandId" = '4ef669a1-7bd2-4a92-86fe-d86b6d6e99c7' AND "packUnits" = 20 AND "stripUnits" = 7;
-- Atova (20 mg Tablet) | 20's pack | old packUnits=20, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'f9b5a9e3-eb3c-41b7-b2c1-8058b9a07001' AND "brandId" = '51cb1c95-89e7-48b8-a70b-d40352d019f4' AND "packUnits" = 20 AND "stripUnits" = 15;
-- Mezoxia (160 mg Tablet) | 14's pack | old packUnits=14, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'ba2e13ca-023c-4727-a4cc-bbfedbb95db3' AND "brandId" = '5278f817-d664-4226-a80d-40179e8a441d' AND "packUnits" = 14 AND "stripUnits" = 10;
-- Nexrab (20 mg Capsule (Enteric Coated)) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '57313cb2-eb24-4d80-918c-ab2c49d93dcb' AND "brandId" = '53e18acc-7a44-4a20-8d32-4e68b9115e2d' AND "packUnits" = 28 AND "stripUnits" = 10;
-- Losardil 100/12.5 (100 mg+12.5 mg Tablet) | 20's pack | old packUnits=20, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '4088572a-6b4e-472d-a6e6-cc97b1ae0a52' AND "brandId" = '5c522a63-8f72-4fac-aa4d-128f0dc121ef' AND "packUnits" = 20 AND "stripUnits" = 14;
-- Bioxim (200 mg Capsule) | 12's pack | old packUnits=12, old stripUnits=7
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '169e6763-9d7c-4db1-bac3-133fc9916017' AND "brandId" = '6b0f6344-f504-4c8e-92cc-e0d266434424' AND "packUnits" = 12 AND "stripUnits" = 7;
-- Alagra (120 mg Tablet) | 30's pack | old packUnits=30, old stripUnits=12
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '8e5792a3-0cfb-46af-b651-52c8952f8dd3' AND "brandId" = '7940420e-fc9c-4f20-b7a7-9a2c56cae387' AND "packUnits" = 30 AND "stripUnits" = 12;
-- Corestin (5 mg Tablet) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '8d899b32-ad4d-437b-9dba-dae98eee5233' AND "brandId" = '86bedd90-2551-4afd-80af-a24f8275049d' AND "packUnits" = 28 AND "stripUnits" = 10;
-- Calcin-D (500 mg+200 IU Tablet) | 15's pack | old packUnits=15, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '6ad4b7ba-b68d-4b96-962e-02a4a9e6ad63' AND "brandId" = '8e41ee1b-ca72-4170-8020-9b7f26de39ed' AND "packUnits" = 15 AND "stripUnits" = 10;
-- Flucloxin (500 mg Capsule) | 36's pack | old packUnits=36, old stripUnits=8
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '22eaab3e-3632-43fc-a89e-5ecd8f7cbfe9' AND "brandId" = 'a88c4a85-90a2-40a1-859c-fbbb445a0311' AND "packUnits" = 36 AND "stripUnits" = 8;
-- Synogen (40 mg Capsule (Delayed Release)) | 30's pack | old packUnits=30, old stripUnits=4
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '2357a20e-1683-47fd-bcd3-dcab3892027c' AND "brandId" = 'aaee0c80-f27b-4654-aaf5-fae2c2a7bfd9' AND "packUnits" = 30 AND "stripUnits" = 4;
-- Nebicard (2.5 mg Tablet) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'c1d1e689-3f6b-43ff-8e21-4dce3e96d056' AND "brandId" = 'b0877011-658d-47f4-be88-0c411751d6d8' AND "packUnits" = 28 AND "stripUnits" = 10;
-- Ezylife (10 mg Tablet) | 50's pack | old packUnits=50, old stripUnits=6
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '947477b8-b57f-48bb-a1f1-cfde86c6d72b' AND "brandId" = 'b19b2cc2-27e0-451e-8144-bc8e5d08de9e' AND "packUnits" = 50 AND "stripUnits" = 6;
-- NapaDol (325 mg+37.5 mg Tablet) | 30's pack | old packUnits=30, old stripUnits=12
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'fdeb8805-4812-419e-a690-8ec387d5f5f1' AND "brandId" = 'b1b3db9f-111c-4b82-835c-ff031feb548c' AND "packUnits" = 30 AND "stripUnits" = 12;
-- Reelife (12.5 mg+5 mg Tablet) | 40's pack | old packUnits=40, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '9c21f478-0155-4f8e-91c6-8eca15aae495' AND "brandId" = 'ba0f3923-3336-4cb6-b75e-6f440eb61eec' AND "packUnits" = 40 AND "stripUnits" = 14;
-- Rabifast (20 mg Tablet (Enteric Coated)) | 50's pack | old packUnits=50, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '0afd8d41-904d-4546-b81b-297af9781a14' AND "brandId" = 'c6f43483-3182-4c56-8acc-8ed3e20c16a3' AND "packUnits" = 50 AND "stripUnits" = 14;
-- Pase (0.5 mg Tablet) | 100's pack | old packUnits=100, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '5324f31c-03eb-4411-863f-c0cba9fbc542' AND "brandId" = 'cd0466e4-315e-4f18-baed-522a43272453' AND "packUnits" = 100 AND "stripUnits" = 15;
-- Famotack (20 mg Tablet) | 100's pack | old packUnits=100, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '7f628296-f1e8-47ec-9ae7-fb1e6ee3ac3a' AND "brandId" = 'd1b8bbd6-e933-411b-b210-bde1d3c0ea30' AND "packUnits" = 100 AND "stripUnits" = 15;
-- AV (5 mg+80 mg Tablet) | 42's pack | old packUnits=42, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '408e0ca9-f2c4-4b8e-99df-e7c6f451fbc6' AND "brandId" = 'e3f729b3-2974-4651-b8e6-9b0da3cb9224' AND "packUnits" = 42 AND "stripUnits" = 10;
-- Losardil (50 mg Tablet) | 30's pack | old packUnits=30, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '3b1473ff-f346-4528-956b-d67d2f60bb25' AND "brandId" = 'e81ab849-e18e-4492-8c16-7c45cfe6626f' AND "packUnits" = 30 AND "stripUnits" = 14;
-- Nebicard (5 mg Tablet) | 28's pack | old packUnits=28, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '528b136f-b608-45e5-b88c-fe4083de13f4' AND "brandId" = 'e88e5f96-404a-41fa-9948-c32ddcc15ec0' AND "packUnits" = 28 AND "stripUnits" = 10;
-- PG (25 mg Capsule) | 24's pack | old packUnits=24, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'c7927fb6-8463-4a18-9bad-fe244503f7f9' AND "brandId" = 'e8c1b339-22a6-4510-862e-0aa09904f7fb' AND "packUnits" = 24 AND "stripUnits" = 10;
-- Ciproxen (500 mg Tablet) | 14's pack | old packUnits=14, old stripUnits=10
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'db31008a-b7f6-4cc0-8b93-123c8412d8ed' AND "brandId" = 'e9fc60d2-2ae2-469f-a94c-170249f028fe' AND "packUnits" = 14 AND "stripUnits" = 10;
-- Zofra ODT (8 mg Dispersible Tablet) | 30's pack | old packUnits=30, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'b27e096d-4103-4247-bb97-39e0ce9624bb' AND "brandId" = 'eb7c8257-b21a-4fdc-8267-fdd2b5202524' AND "packUnits" = 30 AND "stripUnits" = 14;
-- Diapro (80 mg Tablet) | 50's pack | old packUnits=50, old stripUnits=15
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = 'fef97669-07e2-469f-8f25-0b4fae0bf6ae' AND "brandId" = 'ecde9060-a853-4cbe-8bcf-d834d96e463d' AND "packUnits" = 50 AND "stripUnits" = 15;
-- Losardil (100 mg Tablet) | 20's pack | old packUnits=20, old stripUnits=14
UPDATE "MedicinePack" SET "stripUnits" = NULL WHERE "id" = '1f483f74-b474-48fa-af54-de7043d2e09e' AND "brandId" = 'f94ea8fa-05c6-46d1-bff4-41a2cf93ecdd' AND "packUnits" = 20 AND "stripUnits" = 14;

-- Verify exactly 40 rows affected before committing (or COMMIT cleanly):
COMMIT;
