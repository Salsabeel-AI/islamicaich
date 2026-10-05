# عقد التكامل الذي يستخدمه التطبيق

المزود: [سلسبيل — بوابة المطورين](https://barq.salsabeel.ai/developers/?lang=ar).

```http
POST https://barq.salsabeel.ai/api/developer/v1/fata/chat
Authorization: Bearer YOUR_SERVER_SIDE_KEY
Content-Type: application/json
Idempotency-Key: UNIQUE_UUID_FOR_THIS_REQUEST
Accept: application/json
```

```json
{"message":"لماذا يعبد المسلمون الكعبة؟"}
```

في المتابعة يرسل التطبيق `conversation_id` الذي أعادته الخدمة. يدعم التطبيق استقبال JSON أو `text/event-stream` بأحداث `progress` و`text` و`final` و`error`؛ راجع [كود التكامل](../app/src/server.mjs) بدل افتراض حقول غير موثقة.

المتصفح يتصل بوسيط التطبيق في `/api/chat` ولا يرى المفتاح. يعيد الوسيط استخدام معرّف الطلب عند إعادة المحاولة، ويعزل الجلسات، وينقح العرض قبل إرساله للمتصفح. قارئات المراجع تمر بمسارات محددة في [readers.mjs](../app/src/readers.mjs)؛ لا يتيح التطبيق تمرير عنوان خارجي عشوائي.

هذا وصف لاستخدام التطبيق في نسخة التسليم، وليس وعدًا بثبات عقد المزود إلى الأبد. مخرجات الخدمة تعتمد على حسابك وحصته وصلاحياته وإصدار الخدمة الحي.
