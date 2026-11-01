export interface PrintableA4LetterProps {
  unionName: string;
  upazilaName: string;
  districtName: string;
  recipientName: string;
  date: string;
  title: string;
  body: string;
  showRequiredDocuments: boolean;
}

export function PrintableA4Letter({
  unionName,
  upazilaName,
  districtName,
  recipientName,
  date,
  title,
  body,
  showRequiredDocuments,
}: PrintableA4LetterProps) {
  return (
    <article className="a4-letter">
      <span className="corner corner-top-left" aria-hidden="true">
        ❧
      </span>
      <span className="corner corner-top-right" aria-hidden="true">
        ❧
      </span>
      <span className="corner corner-bottom-left" aria-hidden="true">
        ❧
      </span>
      <span className="corner corner-bottom-right" aria-hidden="true">
        ❧
      </span>
      <div className="letter-content">
        <header className="letter-header">
          <p>গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</p>
          <h1>{unionName}</h1>
          <span className="header-accent" aria-hidden="true" />
          <p>
            উপজেলা : {upazilaName} জেলা : {districtName}
          </p>
        </header>
        <div className="memo-line">
          <span>স্মারক নম্বর:</span>
          <span>তারিখ: {date}</span>
        </div>
        <section className="recipient">
          <p>প্রাপক, {recipientName}</p>
          <p>ঠিকানা: বারপাড়া, ১ নং ওয়ার্ড, ডাকঘর: বোয়ালিয়াঘাট</p>
          <p>০৪ নং ঢাকুরিয়া ইউনিয়ন পরিষদ, মণিরামপুর উপজেলা, যশোর।</p>
        </section>
        <section className="letter-message">
          <h2 className="letter-title">{title}</h2>
          <div className="letter-body">
            {body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
          </div>
        </section>
        {showRequiredDocuments && (
          <section className="required-documents">
            <h3>প্রয়োজনীয় কাগজ-পত্রাদি:</h3>
            <ul>
              <li>পিতা ও মাতার অনলাইন বাংলা ও ইংরেজি জন্ম সনদের ফটোকপি।</li>
              <li>সচল মোবাইল নম্বর (ওটিপির মাধ্যমে যাচাই করণের জন্য)।</li>
              <li>হালনাগাদ হোল্ডিংট্যাক্স পরিশোধ রশিদ।</li>
              <li>শিশুর টিকা কার্ড (যদি থাকে)।</li>
            </ul>
          </section>
        )}
        <footer className="letter-footer">
          <div className="copy-to">
            <p>অনুলিপি (সদয় জ্ঞাতার্থে):</p>
            <p>
              ১। উপজেলা নির্বাহী অফিসার, {upazilaName}, {districtName}।
            </p>
          </div>
          <div className="signature">
            <p>জনাব মো: আইয়ুব আলী গাজী</p>
            <p>চেয়ারম্যান</p>
            <p>{unionName}</p>
            <p>
              {upazilaName}, {districtName}।
            </p>
          </div>
        </footer>
      </div>
    </article>
  );
}
